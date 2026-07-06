use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::process::Command;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write, BufReader};
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{Pid, System};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

const PROCESS_CHECK_INTERVAL_SECS: f32 = 0.5;

// Definations

#[derive(Debug, Clone, Deserialize, Serialize)]
enum Triggers {
    // File triggers
    NewFile,
    ChangeFile,
    MoveFile,
    DeleteFile,
    // App triggers
    OpenApp,
    CloseApp,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(tag = "Action", content = "ActionData")]
pub enum Actions {
    Notify { Title: String, Message: String },
    ShellScript { ScriptPath: String },
    PlaySound { SoundPath: String },
    Webhook { HookUrl: String },
}

#[derive(Default)]
struct ThreadMap {
    map: HashMap<String, CancellationToken>,
}

#[derive(Default)]
struct TriggerPath {
    path: PathBuf,
}

fn default_trigger_state() -> bool {
    true
}

#[derive(serde::Serialize)]
struct TriggerOverview {
    name: String,
    state: bool,
}

struct TriggerCache {
    cache: HashMap<String, Trigger>,
}

#[derive(serde::Serialize)]
struct PidList {
    PID: u32,
    NAME: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Trigger {
    name: String,
    trigger_type: Triggers,
    action: Vec<Actions>,
    other_values: OtherValues,
    #[serde(default = "default_trigger_state")]
    state: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
struct OtherValues {
    #[serde(skip_serializing_if = "Option::is_none")]
    Pid: Option<u32>,
    FilePath: Option<String>,
    ProcessName: Option<String>,
    CheckingInterval: f32,
    SpamLimit: u32,
    TriggerLimit: Option<u32>,
}

impl Default for OtherValues {
    fn default() -> Self {
        Self {
            Pid: None,
            FilePath: None,
            ProcessName: None,
            CheckingInterval: 1.0,
            SpamLimit: 5,
            TriggerLimit: None,
        }
    }
}

impl Trigger {
    pub fn new(
        name: String,
        trigger_type: Triggers,
        action: Vec<Actions>,
        other_values: OtherValues,
    ) -> Self {
        Trigger {
            name,
            trigger_type,
            action,
            other_values,
            state: true,
        }
    }

    pub async fn create_task(&mut self, handle: &mut AppHandle) {
        let cancellation_token = CancellationToken::new();
        let worker_token = cancellation_token.clone();
        let name_of_trigger = self.name.clone();
        let trigger_type = self.trigger_type.clone();
        let actions = self.action.iter().cloned().collect::<Vec<Actions>>();
        let other_values = self.other_values.clone();
        let mut work_handle = handle.clone();

        tokio::spawn(async move {
            watch_trigger(
                name_of_trigger,
                trigger_type,
                actions,
                worker_token,
                other_values,
                &mut work_handle,
            )
            .await;
        });

        let state = handle.state::<Mutex<ThreadMap>>();
        let mut thread_map = state.lock().unwrap();
        thread_map.map.insert(self.name.clone(), cancellation_token);
    }
}

// Create event

#[tauri::command]
async fn create_trigger_handled(
    handle: AppHandle,
    name: String,
    trigger_type: String,
    actions: Vec<Actions>,
    other_values: OtherValues,
) -> Result<(), String> {
    let path = {
        let state = handle.state::<Mutex<TriggerPath>>();
        let trigger_path = state.lock().unwrap();
        trigger_path.path.clone()
    };

    let mut file = if path.exists() {
        File::open(&path).expect("Failed to open triggers.json file")
    } else {
        File::create(&path).expect("Failed to create triggers.json file")
    };
    let mut contents = String::new();
    file.read_to_string(&mut contents)
        .expect("Failed to read triggers.json file");
    let mut current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));

    if let Some(map) = current_data.as_object_mut() {
        if map.contains_key(&name) {
            return Err(
                "A trigger with the same name already exists. Please choose a different name."
                    .into(),
            );
        }
        let new_trigger = Trigger::new(
            name.clone(),
            match trigger_type.as_str() {
                "NewFile" => Triggers::NewFile,
                "ChangeFile" => Triggers::ChangeFile,
                "MoveFile" => Triggers::MoveFile,
                "DeleteFile" => Triggers::DeleteFile,
                "OpenApp" => Triggers::OpenApp,
                "CloseApp" => Triggers::CloseApp,
                _ => {
                    return Err("Invalid trigger type. Please select a valid trigger type.".into());
                }
            },
            actions.clone(),
            other_values.clone(),
        );
        map.insert(
            name.clone(),
            serde_json::to_value(new_trigger).expect("Failed to serialize trigger"),
        );
    } else {
        return Err("Failed to parse triggers.json file.".into());
    }
    let pretty_current_data = serde_json::to_string_pretty(&current_data)
        .map_err(|e| format!("Json Parsing error! {}", e))?;
    let mut file = File::create(&path).expect("Failed to create triggers.json file");
    file.write_all(pretty_current_data.as_bytes())
        .expect("Failed to write to triggers.json file");

    let mut app_handle = handle.clone();
    create_trigger(&mut app_handle, name, trigger_type, actions, other_values).await
}

async fn create_trigger(
    handle: &mut AppHandle,
    name: String,
    trigger_type: String,
    actions: Vec<Actions>,
    other_values: OtherValues,
) -> Result<(), String> {
    // accesing to state
    let mut app_handle = handle.clone();
    let is_thread_created_twice = {
        let state = app_handle.state::<Mutex<ThreadMap>>();
        let thread_map = state.lock().unwrap();
        thread_map.map.contains_key(&name)
    };

    if is_thread_created_twice {
        return Err(
            "A trigger with the same name already exists. Please choose a different name.".into(),
        );
    }

    // Validate trigger type
    println!("Trigger type: {}", trigger_type);
    print!("Actions: ");
    for action in &actions {
        println!("{:?}", action);
    };
    let trigger_type = match trigger_type.as_str() {
        "NewFile" => Triggers::NewFile,
        "ChangeFile" => Triggers::ChangeFile,
        "MoveFile" => Triggers::MoveFile,
        "DeleteFile" => Triggers::DeleteFile,
        "OpenApp" => Triggers::OpenApp,
        "CloseApp" => Triggers::CloseApp,
        _ => {
            return Err("Invalid trigger type. Please select a valid trigger type.".into());
        }
    };


    // Validate actions

    let mut NewTrigger = Trigger::new(name, trigger_type, actions, other_values);
    Trigger::create_task(&mut NewTrigger, &mut app_handle).await;
    Ok(())
}

async fn watch_trigger(
    trigger_name: String,
    trigger_type: Triggers,
    actions: Vec<Actions>,
    cancellation_token: CancellationToken,
    other_values: OtherValues,
    handle: &mut AppHandle,
) {
    match trigger_type {
        Triggers::NewFile => {
            // Watch for new file creation
            println!("Watching for new file creation...");
            // Implement the logic to watch for new file creation and execute actions
        }
        Triggers::ChangeFile => {
            // Watch for file changes
            println!("Watching for file changes...");
            // Implement the logic to watch for file changes and execute actions
        }
        Triggers::MoveFile => {
            // Watch for file moves
            println!("Watching for file moves...");
            // Implement the logic to watch for file moves and execute actions
        }
        Triggers::DeleteFile => {
            // Watch for file deletions
            println!("Watching for file deletions...");
            // Implement the logic to watch for file deletions and execute actions
        }
        Triggers::OpenApp => {
            println!("Watching for app openings...");
            watch_process_by_name(
                trigger_name,
                cancellation_token,
                handle,
                actions,
                other_values,
                true,
            )
            .await;
        }
        Triggers::CloseApp => {
            println!("Watching for app closings...");
            watch_process_by_name(
                trigger_name,
                cancellation_token,
                handle,
                actions,
                other_values,
                false,
            )
            .await;
        }
    }
}

async fn execute_actions(handle: &AppHandle, actions: &[Actions]) {
    if actions.is_empty() {
        println!("No valid action found for this trigger.");
        return;
    }

    for action in actions {
        execute_action(handle, action).await;
    }
}

async fn execute_action(handle: &AppHandle, action: &Actions) {
    match action {
        Actions::Notify { Title, Message } => {
            println!("Notify action: title='{}' message='{}'", Title, Message);
            if let Ok(mut resource_path) = handle.path().resource_dir() {
                resource_path.push("notification.png");

                if let Some(icon_path_str) = resource_path.to_str() {
                    println!("Notify: using icon path='{}'", icon_path_str);
                    match handle
                        .notification()
                        .builder()
                        .title(Title)
                        .body(Message)
                        .icon(icon_path_str)
                        .show()
                    {
                        Ok(_) => {
                            println!("Notification shown successfully (with icon).");
                        }
                        Err(e) => {
                            eprintln!("Failed to send notification (with icon): {}", e);
                            // Fallback: try notify-send synchronously and log output
                            match tokio::process::Command::new("notify-send").arg(Title).arg(Message).output().await {
                                Ok(output) => {
                                    println!("notify-send exit: {}", output.status);
                                    if !output.stdout.is_empty() {
                                        println!("notify-send stdout: {}", String::from_utf8_lossy(&output.stdout));
                                    }
                                    if !output.stderr.is_empty() {
                                        eprintln!("notify-send stderr: {}", String::from_utf8_lossy(&output.stderr));
                                    }
                                }
                                Err(e) => eprintln!("notify-send fallback failed to run: {}", e),
                            }
                        }
                    }
                } else {
                    println!("Notify: resource dir exists but path->str failed: {:?}", resource_path);
                    match handle
                        .notification()
                        .builder()
                        .title(Title)
                        .body(Message)
                        .show()
                    {
                        Ok(_) => {
                            println!("Notification shown successfully (no icon).");
                        }
                        Err(e) => {
                            eprintln!("Failed to send notification (no icon): {}", e);
                            match tokio::process::Command::new("notify-send").arg(Title).arg(Message).output().await {
                                Ok(output) => {
                                    println!("notify-send exit: {}", output.status);
                                    if !output.stdout.is_empty() {
                                        println!("notify-send stdout: {}", String::from_utf8_lossy(&output.stdout));
                                    }
                                    if !output.stderr.is_empty() {
                                        eprintln!("notify-send stderr: {}", String::from_utf8_lossy(&output.stderr));
                                    }
                                }
                                Err(e) => eprintln!("notify-send fallback failed to run: {}", e),
                            }
                        }
                    }
                }
            } else {
                println!("Notify: no resource dir; sending notification without icon.");
                match handle
                    .notification()
                    .builder()
                    .title(Title)
                    .body(Message)
                    .show()
                {
                    Ok(_) => {
                        println!("Notification shown successfully (no resource dir).");
                    }
                    Err(e) => {
                        eprintln!("Failed to send notification (no resource dir): {}", e);
                        match tokio::process::Command::new("notify-send").arg(Title).arg(Message).output().await {
                            Ok(output) => {
                                println!("notify-send exit: {}", output.status);
                                if !output.stdout.is_empty() {
                                    println!("notify-send stdout: {}", String::from_utf8_lossy(&output.stdout));
                                }
                                if !output.stderr.is_empty() {
                                    eprintln!("notify-send stderr: {}", String::from_utf8_lossy(&output.stderr));
                                }
                            }
                            Err(e) => eprintln!("notify-send fallback failed to run: {}", e),
                        }
                    }
                }
            }
        }
        Actions::ShellScript { ScriptPath } => {
            if let Err(e) = Command::new("/bin/sh").arg(ScriptPath).spawn() {
                eprintln!("Failed to execute shell script: {}", e);
            }
        }
        Actions::PlaySound { SoundPath } => {
            let sink_handle = rodio::DeviceSinkBuilder::open_default_sink().expect("Error occurred while opening the default audio sink");
            if let Ok(file) = File::open(SoundPath) {
                let file = BufReader::new(file);

                match rodio::play(&sink_handle.mixer(), file) {
                    Ok(player) => {
                        // allow other tasks (UI/event loop) to run so notifications can show immediately
                        tokio::task::yield_now().await;

                        // run the blocking sleep on a dedicated thread so we don't block the async runtime
                        let join = tokio::task::spawn_blocking(move || {
                            player.sleep_until_end();
                        });

                        if let Err(e) = join.await {
                            eprintln!("Error while waiting for playback to finish: {}", e);
                        }
                    }
                    Err(e) => eprintln!("Failed to play sound: {}", e),
                }
            } else {
                eprintln!("Failed to open sound file: {}", SoundPath);
            }
        }
        Actions::Webhook { HookUrl } => {
            // Implement webhook logic here
            println!("Webhook action is not implemented yet: {}", HookUrl);
        }
    }
}

fn remove_thread_from_cache(handle: &AppHandle, thread_name: &str) {
    let state = handle.state::<Mutex<ThreadMap>>();
    let mut thread_map = state.lock().unwrap();
    thread_map.map.remove(thread_name);
}

fn trigger_path(handle: &AppHandle) -> PathBuf {
    let state = handle.state::<Mutex<TriggerPath>>();
    let trigger_path = state.lock().unwrap();
    trigger_path.path.clone()
}

fn update_trigger_state_in_storage(
    handle: &AppHandle,
    trigger_name: &str,
    state: bool,
) -> Result<(), String> {
    let path = trigger_path(handle);

    let contents = if path.exists() {
        fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read triggers.json file: {}", e))?
    } else {
        String::new()
    };

    let mut current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));

    let Some(map) = current_data.as_object_mut() else {
        return Err("Failed to parse triggers.json file.".into());
    };

    let Some(trigger_value) = map.get_mut(trigger_name) else {
        return Err(format!("Trigger '{}' was not found.", trigger_name));
    };

    let Some(trigger_object) = trigger_value.as_object_mut() else {
        return Err(format!("Trigger '{}' has an invalid JSON format.", trigger_name));
    };

    trigger_object.insert("state".into(), json!(state));

    let pretty_current_data = serde_json::to_string_pretty(&current_data)
        .map_err(|e| format!("Json Parsing error! {}", e))?;
    fs::write(&path, pretty_current_data)
        .map_err(|e| format!("Failed to write to triggers.json file: {}", e))?;

    Ok(())
}

async fn start_trigger_from_storage(handle: &mut AppHandle, trigger_name: &str) -> Result<(), String> {
    let path = trigger_path(handle);

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read triggers.json file: {}", e))?;

    let current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));
    let Some(trigger_value) = current_data.get(trigger_name).cloned() else {
        return Err(format!("Trigger '{}' was not found.", trigger_name));
    };

    let trigger = serde_json::from_value::<Trigger>(trigger_value)
        .map_err(|e| format!("Failed to load trigger '{}': {}", trigger_name, e))?;

    if !trigger.state {
        return Ok(());
    }

    create_trigger(
        handle,
        trigger.name.clone(),
        format!("{:?}", trigger.trigger_type),
        trigger.action.clone(),
        trigger.other_values.clone(),
    )
    .await
}

#[tauri::command]
async fn get_trigger_details(handle: AppHandle, name: String) -> Result<Trigger, String> {
    let path = trigger_path(&handle);

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read triggers.json file: {}", e))?;

    let current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));
    let Some(trigger_value) = current_data.get(&name).cloned() else {
        return Err(format!("Trigger '{}' was not found.", name));
    };

    serde_json::from_value::<Trigger>(trigger_value)
        .map_err(|e| format!("Failed to load trigger '{}': {}", name, e))
}

#[tauri::command]
async fn delete_trigger(handle: AppHandle, name: String) -> Result<(), String> {
    let _ = stop_trigger(handle.clone(), name.clone()).await;

    let path = trigger_path(&handle);
    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read triggers.json file: {}", e))?;

    let mut current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));
    let Some(map) = current_data.as_object_mut() else {
        return Err("Failed to parse triggers.json file.".into());
    };

    map.remove(&name);

    let pretty_current_data = serde_json::to_string_pretty(&current_data)
        .map_err(|e| format!("Json Parsing error! {}", e))?;
    fs::write(&path, pretty_current_data)
        .map_err(|e| format!("Failed to write to triggers.json file: {}", e))?;

    Ok(())
}

fn normalize_process_name(process_name: &str) -> String {
    process_name.trim().to_ascii_lowercase()
}

fn is_process_running(system: &System, process_name: &str) -> bool {
    let normalized_target = normalize_process_name(process_name);

    system.processes().values().any(|process| {
        normalize_process_name(process.name().to_string_lossy().as_ref()) == normalized_target
    })
}

async fn watch_process_by_name(
    thread_name: String,
    cancellation_token: CancellationToken,
    handle: &mut AppHandle,
    actions: Vec<Actions>,
    other_values: OtherValues,
    fire_when_running: bool,
) {
    let Some(process_name) = other_values.ProcessName else {
        eprintln!("Trigger '{}' does not have a ProcessName.", thread_name);
        remove_thread_from_cache(handle, &thread_name);
        return;
    };

    let mut system = System::new_all();

    system.refresh_all();
    let mut current_state = is_process_running(&system, &process_name);

    if current_state == fire_when_running {
        println!(
            "Process '{}' for trigger '{}' already matched target state.",
            process_name, thread_name
        );
        execute_actions(handle, &actions).await;
        let _ = update_trigger_state_in_storage(handle, &thread_name, false);
        remove_thread_from_cache(handle, &thread_name);
        return;
    }

    loop {
        tokio::select! {
            _ = cancellation_token.cancelled() => {
                println!("Trigger '{}' has been cancelled.", thread_name);
                println!("Thread will be deleted from the cache.");
                let _ = update_trigger_state_in_storage(handle, &thread_name, false);
                remove_thread_from_cache(handle, &thread_name);
                break;
            }
            
            _ = sleep(Duration::from_secs_f32(other_values.CheckingInterval)) => {
                system.refresh_all();
                current_state = is_process_running(&system, &process_name);

                if current_state == fire_when_running {
                    println!(
                        "Process '{}' for trigger '{}' matched target state.",
                        process_name, thread_name
                    );
                    execute_actions(handle, &actions).await;
                    let _ = update_trigger_state_in_storage(handle, &thread_name, false);
                    remove_thread_from_cache(handle, &thread_name);
                    break;
                }
            }
        }
    }
}

// Trigger Functions

#[tauri::command]
fn get_all_triggers() -> Vec<String> {
    let triggers = vec![
        Triggers::NewFile,
        Triggers::ChangeFile,
        Triggers::MoveFile,
        Triggers::DeleteFile,
        Triggers::OpenApp,
        Triggers::CloseApp,
    ];

    triggers
        .iter()
        .map(|trigger| format!("{:?}", trigger))
        .collect()
}

#[tauri::command]
async fn get_file_triggers() -> Vec<String> {
    let triggers = vec![
        Triggers::NewFile,
        Triggers::ChangeFile,
        Triggers::MoveFile,
        Triggers::DeleteFile,
    ];

    triggers
        .iter()
        .map(|trigger| format!("{:?}", trigger))
        .collect()
}

#[tauri::command]
async fn get_app_triggers() -> Vec<String> {
    let triggers = vec![Triggers::OpenApp, Triggers::CloseApp];

    triggers
        .iter()
        .map(|trigger| format!("{:?}", trigger))
        .collect()
}

#[tauri::command]
async fn get_active_triggers(handle: AppHandle) -> Vec<TriggerOverview> {
    let path = trigger_path(&handle);

    let contents = match fs::read_to_string(&path) {
        Ok(contents) => contents,
        Err(_) => return vec![],
    };

    let current_data: Value = serde_json::from_str(&contents).unwrap_or_else(|_| json!({}));
    let mut active_triggers = vec![];

    if let Some(map) = current_data.as_object() {
        for (name, value) in map.iter() {
            let state = value
                .get("state")
                .and_then(Value::as_bool)
                .unwrap_or(true);

            active_triggers.push(TriggerOverview {
                name: name.clone(),
                state,
            });
        }
    }

    active_triggers.sort_by(|left, right| left.name.cmp(&right.name));
    active_triggers
}

#[tauri::command]
async fn stop_trigger(handle: AppHandle, name: String) -> Result<(), String> {
    update_trigger_state_in_storage(&handle, &name, false)?;

    let cancellation_token = {
        let state = handle.state::<Mutex<ThreadMap>>();
        let mut thread_map = state.lock().unwrap();
        thread_map.map.remove(&name)
    };

    match cancellation_token {
        Some(token) => {
            token.cancel();
            Ok(())
        }
        None => Ok(()),
    }
}

#[tauri::command]
async fn start_trigger(handle: AppHandle, name: String) -> Result<(), String> {
    update_trigger_state_in_storage(&handle, &name, true)?;

    let is_running = {
        let state = handle.state::<Mutex<ThreadMap>>();
        let thread_map = state.lock().unwrap();
        thread_map.map.contains_key(&name)
    };

    if is_running {
        return Ok(());
    }

    let mut local_handle = handle.clone();
    start_trigger_from_storage(&mut local_handle, &name).await
}

// PID Functions
#[tauri::command]
async fn checkPID(process_id: u32) -> bool {
    let mut sys = System::new_all();
    sys.refresh_all();

    let process_id = Pid::from_u32(process_id);
    let mut state_of_pid_check = false;

    for (syspid, process) in sys.processes() {
        if &process_id == syspid {
            state_of_pid_check = true;
            break;
        } else {
            state_of_pid_check = false;
        }
    }
    state_of_pid_check
}

#[tauri::command]
async fn listPID() -> Vec<PidList> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut pid_list: Vec<PidList> = vec![];

    for (pid, processname) in sys.processes() {
        let pidnum = pid.as_u32();
        pid_list.push(PidList {
            PID: pidnum,
            NAME: processname.name().to_string_lossy().into_owned(),
        });
    }

    pid_list
}

#[tauri::command]
async fn infoPID(process_id: u32) -> String {
    let mut sys = System::new_all();
    sys.refresh_all();

    let pid = Pid::from_u32(process_id);
    for (syspid, process) in sys.processes() {
        if &pid == syspid {
            return process.name().to_string_lossy().into_owned();
        }
    }
    "Process not found".into()
}

async fn get_pid_info(process_id: u32) -> Option<String> {
    let mut sys = System::new_all();
    sys.refresh_all();

    let pid = Pid::from_u32(process_id);
    for (syspid, process) in sys.processes() {
        if &pid == syspid {
            return Some(process.name().to_string_lossy().into_owned());
        }
    }
    None
}

// Main function
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Initialization of setup values

            // Creating triggers.json file if it doesn't exist
            let mut path = app.app_handle().path().app_local_data_dir().expect("msg");
            if !path.exists() {
                fs::create_dir_all(&path).expect("Failed to create app data directory");
            }

            path.push("triggers.json");
            println!("Path to triggers.json: {:?}", path);
            let path_clone = path.clone();
            app.manage(Mutex::new(TriggerPath { path: path_clone }));

            let mut current_data: Value = if !path.exists() {
                File::create(&path).expect("Failed to create triggers.json file");
                let free_json = json!({});
                let mut file = File::create(&path).expect("Failed to create triggers.json file");
                file.write_all(free_json.to_string().as_bytes())
                    .expect("Failed to write to triggers.json file");
                free_json
            } else {
                let mut file = File::open(&path).expect("Failed to open triggers.json file");
                let mut contents = String::new();
                file.read_to_string(&mut contents)
                    .expect("Failed to read triggers.json file");
                serde_json::from_str(&contents).unwrap_or_else(|_| json!({}))
            };

            let app_handle = app.app_handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Some(map) = current_data.as_object() {
                    for (key, value) in map.iter() {
                        if let Ok(trigger) = serde_json::from_value::<Trigger>(value.clone()) {
                            if !trigger.state {
                                continue;
                            }

                            let mut local_handle = app_handle.clone();
                            println!("Name of trigger: {:?}", trigger.name.clone());
                            println!("Type of trigger: {:?}", trigger.trigger_type);
                            println!("Actions of trigger: {:?}", trigger.action);
                            println!("Other values of trigger: {:?}", trigger.other_values);

                            create_trigger(
                                &mut local_handle,
                                trigger.name.clone(),
                                format!("{:?}", trigger.trigger_type),
                                trigger.action.clone(),
                                trigger.other_values.clone(),
                            )
                            .await
                            .expect("Failed to create trigger");
                        }
                    }
                }
            });

            // Thread map
            app.manage(Mutex::new(ThreadMap::default()));
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_all_triggers,
            get_file_triggers,
            get_app_triggers,
            get_active_triggers,
            get_trigger_details,
            stop_trigger,
            start_trigger,
            delete_trigger,
            checkPID,
            listPID,
            infoPID,
            create_trigger_handled
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
