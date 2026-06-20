use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use std::sync::{Mutex};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::PathBuf;
use tokio::time::{sleep, Duration};
use sysinfo::{Pid, System};
use serde::{Serialize, Deserialize};
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;

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

#[derive(Clone, Debug,serde::Serialize, serde::Deserialize)]
#[serde(tag = "Action", content = "ActionData")]
pub enum Actions {
    Notify{
        Title : String, 
        Message : String
    },
    ShellScript{
        ScriptPath : String
    },
    PlaySound{
        SoundPath : String
    },
    Webhook {
        HookUrl : String
    },
}

#[derive(Default)]
struct ThreadMap {
    map: HashMap<String, CancellationToken>,
}

#[derive(Default)]
struct TriggerPath {
    path: PathBuf,
}

struct TriggerCache {
    cache: HashMap<String, Trigger>,
}

#[derive(serde::Serialize)]
struct PidList{
    PID : u32,
    NAME : String
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Trigger {
    name: String,
    trigger_type: Triggers,
    action: Vec<Actions>,
    other_values: OtherValues,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct OtherValues {
    #[serde(skip_serializing_if = "Option::is_none")]
    Pid: Option<u32>,
    FilePath: Option<String>,
}


impl Trigger {
    pub fn new(name: String, trigger_type: Triggers, action: Vec<Actions>, other_values: OtherValues) -> Self {
        Trigger {
            name,
            trigger_type,
            action,
            other_values,
        }
    }

    pub async fn create_task(&mut self, handle : &mut AppHandle) {

        let cancellation_token = CancellationToken::new();
        let worker_token = cancellation_token.clone();
        let name_of_trigger = self.name.clone();
        let trigger_type = self.trigger_type.clone();
        let actions = self.action.iter().cloned().collect::<Vec<Actions>>();
        let other_values = self.other_values.clone();
        let mut work_handle = handle.clone();


        tokio::spawn(async move {
            watch_trigger(name_of_trigger, trigger_type, actions, worker_token, other_values, &mut work_handle).await;
        });

        let state = handle.state::<Mutex<ThreadMap>>();
        let mut thread_map = state.lock().unwrap();
        thread_map.map.insert(self.name.clone(), cancellation_token);
        
    }

}


// Create event

    
#[tauri::command]
async fn create_trigger_frontend(handle : AppHandle,name : String, trigger_type: String, actions: Vec<Actions>, other_values: OtherValues) -> Result<(), String> {
    let mut app_handle = handle.clone();
    create_trigger(&mut app_handle, name, trigger_type, actions, other_values).await
}


async fn create_trigger(handle : &mut AppHandle, name : String, trigger_type: String, actions: Vec<Actions>, other_values: OtherValues) -> Result<(), String> {
    // accesing to state
    let mut app_handle = handle.clone();
    let is_thread_created_twice = {
        let state = app_handle.state::<Mutex<ThreadMap>>();
        let thread_map = state.lock().unwrap();
        thread_map.map.contains_key(&name)
    };

    if is_thread_created_twice {
        return Err("A trigger with the same name already exists. Please choose a different name.".into());
    }
    

    
    // Validate trigger type
    println!("Trigger type: {}", trigger_type);
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
    Trigger::create_task(&mut NewTrigger,&mut app_handle).await;
    Ok(())
}

async fn watch_trigger(trigger_name : String,trigger_type : Triggers, actions: Vec<Actions> ,cancellation_token : CancellationToken, other_values: OtherValues, handle : &mut AppHandle) {
    
    match trigger_type {
        Triggers::NewFile => {
            // Watch for new file creation
            println!("Watching for new file creation...");
            // Implement the logic to watch for new file creation and execute actions
        },
        Triggers::ChangeFile => {
            // Watch for file changes
            println!("Watching for file changes...");
            // Implement the logic to watch for file changes and execute actions
        },
        Triggers::MoveFile => {
            // Watch for file moves
            println!("Watching for file moves...");
            // Implement the logic to watch for file moves and execute actions
        },
        Triggers::DeleteFile => {
            // Watch for file deletions
            println!("Watching for file deletions...");
            // Implement the logic to watch for file deletions and execute actions
        },
        Triggers::OpenApp => {
            // Watch for app openings
            println!("Watching for app openings...");
            // Implement the logic to watch for app openings and execute actions
        },
        Triggers::CloseApp => {
            println!("Watching for app closings...");
            CloseApp(trigger_name, cancellation_token, handle).await;
        },
    }


    async fn CloseApp(thread_name: String, cancellation_token: CancellationToken, handle : &mut AppHandle) {
        loop {
            tokio::select! {
                _ = sleep(Duration::from_secs(2)) => {
                    println!("test");
                }
                _ = cancellation_token.cancelled() => {
                    println!("Trigger '{}' has been cancelled.", thread_name);
                    println!("Thread will be deleted from the cache.");
                    let state = handle.state::<Mutex<ThreadMap>>();
                    let mut thread_map = state.lock().unwrap();
                    thread_map.map.remove(&thread_name);
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
    let triggers = vec![
        Triggers::OpenApp,
        Triggers::CloseApp,
    ];

    triggers
        .iter()
        .map(|trigger| format!("{:?}", trigger))
        .collect()
}

// PID Functions
#[tauri::command]
async fn checkPID(process_id : u32) -> bool{
    let mut sys = System::new_all();
    sys.refresh_all();

    let process_id = Pid::from_u32(process_id);
    let mut state_of_pid_check = false;

    for (syspid, process) in sys.processes(){
        if &process_id == syspid{
            state_of_pid_check = true;
            break;
        }
        else{
            state_of_pid_check = false;
        }
    }
    state_of_pid_check
}

#[tauri::command]
async fn listPID() -> Vec<PidList>{
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut pid_list : Vec<PidList> = vec![];

    for (pid, processname) in sys.processes() {
        let pidnum = pid.as_u32();
        pid_list.push(PidList{
            PID : pidnum,
            NAME : processname.name().to_string_lossy().into_owned()
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

// Main function
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app|
        {
            // Initialization of setup values

            // Creating triggers.json file if it doesn't exist
            let mut path = app.app_handle().path().app_local_data_dir().expect("msg");
            if !path.exists(){
                fs::create_dir_all(&path).expect("Failed to create app data directory");
            }

            path.push("triggers.json");
            println!("Path to triggers.json: {:?}", path);
            let path_clone = path.clone();
            app.manage(Mutex::new(TriggerPath { path: path_clone }));

            let mut current_data : Value = if !path.exists() {
                File::create(&path).expect("Failed to create triggers.json file");
                let free_json = json!({});
                let mut file = File::create(&path).expect("Failed to create triggers.json file");
                file.write_all(free_json.to_string().as_bytes()).expect("Failed to write to triggers.json file");
                free_json
            } else {
                let mut file = File::open(&path).expect("Failed to open triggers.json file");
                let mut contents = String::new();
                file.read_to_string(&mut contents).expect("Failed to read triggers.json file");
                serde_json::from_str(&contents).unwrap_or_else(|_| json!({}))
            };
            
            let app_handle = app.app_handle().clone();

            tauri::async_runtime::spawn(async move {
                if let Some(map) = current_data.as_object() {
                        for (key, value) in map.iter() {
                            if let Ok(trigger) = serde_json::from_value::<Trigger>(value.clone()) {
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
                                    trigger.other_values.clone()
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
        .invoke_handler(tauri::generate_handler![get_all_triggers, get_file_triggers, get_app_triggers, checkPID, listPID, infoPID, create_trigger_frontend])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
