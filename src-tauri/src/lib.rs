use sysinfo::{Pid, System};

// Definations

#[derive(Debug)]
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

enum Actions {
    Notify(String, String),
    ShellScript(String),
    PlaySound(String),
    Webhook(String),
}

#[derive(serde::Serialize)]
struct PidList{
    PID : u32,
    NAME : String
}

struct Trigger {
    name: String,
    trigger_type: Triggers,
    action: Vec<Actions>,
    webhook_url: Option<String>,
}



// Create event

    
#[tauri::command]
async fn create_trigger(name : String, trigger_type: String, actions: Vec<Actions>) -> Result<(), String> {
    // Validate trigger type
    let trigger_type_backend = match trigger_type.as_str() {
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
    
    for action in actions.iter(){
        match action {
            Actions::Notify(Title, Message) => println!("Action Notify is detected, values: {}, {}", Title, Message),
            Actions::ShellScript(ScriptPath) => println!("Action Shellscript is detected, values: {}", ScriptPath),
            Actions::PlaySound(SoundPath) => println!("Action PlaySound is detected, values: {}", SoundPath),
            Actions::Webhook(HookUrl) => println!("Action WebHook is detected, values: {}", HookUrl),
            _ => println!("ERROR!")   
        }

    }

    Ok(())
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![get_all_triggers, get_file_triggers, get_app_triggers, checkPID, listPID, infoPID])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
