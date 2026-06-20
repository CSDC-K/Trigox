// imports

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { resolveResource } from "@tauri-apps/api/path";
import { open, message } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

// Values for using in Rust commands

interface PidList {
  PID: number;
  NAME: string;
}

interface OtherValues {
  Pid?: number;
  FilePath?: string;
}

type Actions = 
 | { Action: "Notify", ActionData: { Title: string, Message: string } }
 | { Action: "ShellScript", ActionData: { ScriptPath: string } }
 | { Action: "PlaySound", ActionData: { SoundPath: string } }
 | { Action: "Webhook", ActionData: { HookUrl: string } }



 // HTML values

const TriggerList = document.getElementById("triggerlist") as HTMLSelectElement;

const PidList = document.getElementById("pid-list") as HTMLUListElement;

const TargetFolderInput = document.getElementById("targetfolder") as HTMLInputElement;
const TargetPIDInput = document.getElementById("targetPID") as HTMLInputElement;
const CheckBoxShellScript = document.getElementById("runShellCheck") as HTMLInputElement;
const CheckBoxNotify = document.getElementById("showNotifCheck") as HTMLInputElement;
const CheckBoxSound = document.getElementById("soundPlayCheck") as HTMLInputElement;
const CheckBoxWebhook = document.getElementById("autoRestartCheck") as HTMLInputElement;
const advInput1 = document.getElementById("advInput1") as HTMLInputElement;
const advInput2 = document.getElementById("advInput2") as HTMLInputElement;
const timeInput = document.getElementById("timeinput") as HTMLInputElement;
const triggernameInput = document.getElementById("nameinput") as HTMLInputElement;

const FileTriggerDiv = document.getElementById("FileTriggerDiv") as HTMLDivElement;
const AppTriggerDiv = document.getElementById("AppTriggerDiv") as HTMLDivElement;
const NotifyDiv = document.getElementById("notifydiv") as HTMLDivElement;
const WebhookDiv = document.getElementById("webhookdiv") as HTMLDivElement;
const WebhookInput = document.getElementById("webhookinput") as HTMLInputElement;

const CreateTriggerBtn = document.getElementById("createTriggerBtn") as HTMLButtonElement;
const DocsBtn = document.getElementById("docsBtn") as HTMLButtonElement;

const PidTitle = document.getElementById("pidtitle") as HTMLHeadingElement;

const notifyTitleInput = document.getElementById("notifytitleinput") as HTMLInputElement;
const notifyMessageInput = document.getElementById("notifymessageinput") as HTMLInputElement;


// TriggerType based variables

// File trigger variables
var TargetFolderValue = TargetFolderInput.value;



// App trigger variables
var ConfirmedPID = false;
var TargetPIDValue = TargetPIDInput.value;
var TargetPIDName = Promise.resolve("");

var ShellScriptPath = "";
var SoundPath = "";
var WebhookUrl = "";

var NotifyTitle = "";
var NotifyMessage = "";

// Advanced settings variables
var ScanPerSecond = 1.0;
var SpamLimit = 5;

// Main variables
var TriggerName = "";
var TriggerType = "";
var ExecuteAfter = 0;


// Functions

async function Create() {
  if (!TriggerType) {
    digitalAlart("Error", "Please select a trigger type.", "Error");
    return;
  }

  else {

    var FileTriggers = await invoke<string[]>("get_file_triggers");
    var AppTriggers = await invoke<string[]>("get_app_triggers");

    if (FileTriggers.includes(TriggerType)) {
      return;
    } if (AppTriggers.includes(TriggerType)) {
      
        // Validation of inputs and settings

        let notify = false;
        let shell = false;
        let sound = false;
        let webhook = false;

        if (CheckBoxNotify.checked) {
          notify = true;
        } if (CheckBoxShellScript.checked) {
          shell = true;
        } if (CheckBoxSound.checked) {
          sound = true;
        } if (CheckBoxWebhook.checked) {
          webhook = true;
        }

        if (!notify && !shell && !sound && !webhook) {
          digitalAlart("Error", "At least one action must be selected (Notification, Shell Script, Sound Play, Webhook). Please select at least one action to perform when the trigger is activated.", "Error");
          return;
        } else if (notify) {
          NotifyTitle = notifyTitleInput.value;
          NotifyMessage = notifyMessageInput.value;

          let hasPermission = await isPermissionGranted();
          if (!hasPermission) {
            const permission = await requestPermission();
            if (permission !== "granted") {
              console.error("Notification permission denied");
              CheckBoxNotify.checked = false;
              digitalAlart("Error", "Notification permission denied. Please allow notifications to use this feature.", "Error");
              return;
            }
          }

          if (!NotifyTitle.trim() || !NotifyMessage.trim()) {
            digitalAlart("Error", "Notification option is checked but title or message is empty. Please enter a title and message for the notification.", "Error");
            return;
          }

        } else if (shell) {
          if (!ShellScriptPath) {
            digitalAlart("Error", "Shell script option is checked but no script is selected. Please select a shell script to run on trigger.", "Error");
            return;
          }
        } else if (sound) {
          if (!SoundPath) {
            digitalAlart("Error", "Sound play option is checked but no audio file is selected. Please select an audio file to play on trigger.", "Error");
            return;
          }
        } else if (webhook) {
          WebhookUrl = WebhookInput.value;
          if (!WebhookUrl.trim()) {
            digitalAlart("Error", "Webhook option is checked but no URL is entered. Please enter a webhook URL.", "Error");
            return;
          }
        }
        SpamLimit = parseInt(advInput2.value) || 5;
        ScanPerSecond = parseFloat(advInput1.value) || 1.0;

        TargetPIDValue = TargetPIDInput.value;
        try {
          TargetPIDName = invoke<string>("infoPID", { processId: parseInt(TargetPIDValue) });
        } catch(e) {
          console.error(e);
          TargetPIDName = Promise.resolve("");
        }

        TriggerName = triggernameInput.value;
        ExecuteAfter = parseInt(timeInput.value) || 0;
        

        if (!TriggerName.trim()) {
          digitalAlart("Error", "Trigger name cannot be empty. Please enter a name for the trigger.", "Error");
          return;
        }

        else if (!ConfirmedPID) {
          digitalAlart("Error", "Target PID is not confirmed. Please enter a valid PID and click the 'Check PID' button.", "Error");
          return;
        }

        // If all validations are passed, create the trigger

        const selectedActions: Actions[] = [];

        if (notify) {
          selectedActions.push({
            Action: "Notify",
            ActionData: { Title: NotifyTitle, Message: NotifyMessage }
          });
        }
        
        if (shell) {
          selectedActions.push({
            Action: "ShellScript",
            ActionData: { ScriptPath: ShellScriptPath }
          });
        }
        
        if (sound) {
          selectedActions.push({
            Action: "PlaySound",
            ActionData: { SoundPath: SoundPath }
          });
        }
        
        if (webhook) {
          selectedActions.push({
            Action: "Webhook",
            ActionData: { HookUrl: WebhookUrl }
          });
        }  


        try {
          await invoke("create_trigger", {
            name: TriggerName,
            triggerType: TriggerType,
            actions: selectedActions,
            otherValues: {
              Pid: parseInt(TargetPIDValue),
            }
          });
        } catch(e) {
          console.error(e);
          digitalAlart("Error", `${e}`, "Error");
          return;
        }

        digitalAlart("Success", `Trigger "${TriggerName}" created successfully!`, "Success");
        return;

    
    }
  }
}

async function saveNotifySettings() {

  const window = document.getElementById("notifydiv") as HTMLDivElement;

  if ( notifyTitleInput.value != "" && notifyMessageInput.value != "" ) {
    NotifyMessage = notifyMessageInput.value;
    NotifyTitle = notifyTitleInput.value;
    digitalAlart("Notify Settings", "Saved.", "Success");
    window.style.display = "none";
  } else {
    digitalAlart("Error", "You have to fill the blanks.", "Error");
  }
}

async function FolderDialog() {
  TargetFolderValue = await open({
    directory: true,
    multiple: false,
    title: "Select Target Folder",
  }) as string;

  if (TargetFolderValue) {
    TargetFolderInput.value = TargetFolderValue;
  }

  else {
    TargetFolderInput.value = "";
    digitalAlart("Error", "No folder selected. Please select a target folder.", "Error");
  }
}

async function checkPID() {

  var targetPID = TargetPIDInput.value;

  console.log("Checking PID:", targetPID);

  var PIDCheck = await invoke<boolean>("checkPID", { processId: parseInt(targetPID) });
  
  if (PIDCheck == true) {
    digitalAlart("Success", `Process with PID ${targetPID} is running.`, "Success");
    PidTitle.innerText = "Enter target PID (Confirmed)";
    TargetPIDValue = targetPID;
    ConfirmedPID = true;
  }

  else {
    digitalAlart("Error", `Process with PID ${targetPID} is not running. Please enter a valid PID.`, "Error");
    TargetPIDValue = "";
    PidTitle.innerText = "Enter target PID (Not Confirmed)";
  }

}

async function listPID() {
  const windowElement = document.querySelector(".listofPIDwindow") as HTMLDivElement;
  const listElement = document.querySelector(".pid-list") as HTMLUListElement;

  if (windowElement && listElement) {
    // Pencereyi görünür yap
    windowElement.style.display = "block";
    
    // Her çağrıda listeyi sıfırla ki üst üste binmesin
    listElement.innerHTML = "";

    try {
      const processList = await invoke<PidList[]>("listPID");

      // Yeni li elemanlarını ekle
      for (const process of processList) {
        const li = document.createElement("li");
        li.className = "pid-list-value";
        li.dataset.pid = process.PID.toString(); // Arka planda pid numarasını data-pid olarak taşıyoruz
        li.innerText = `${process.NAME}`;
        listElement.appendChild(li);
      }
    } catch (e) {
      console.error(e);
      digitalAlart("Error", "Could not fetch PID list", "Error");
    }
  }
}


async function infoPID() {
  try {
    const info = await invoke<string>("infoPID", { processId: parseInt(TargetPIDValue) });
    message(`Selected PID: ${TargetPIDValue}\nProcess Name: ${info}`, { title: `Process Information`, kind: "info" });
  } catch (e) {
    console.error(e);
    digitalAlart("Error", "Could not fetch PID information", "Error");
  }
}

async function digitalAlart(Title: string, Message: string, Type: string) {

  let hasPermission = await isPermissionGranted();
  if (!hasPermission) {
    const permission = await requestPermission();
    if (permission !== "granted") {
      console.error("Notification permission denied");
      return;
    }
  }

  let iconPath;
  try {
     if (Type === "Success") {
        iconPath = await resolveResource('../src/assets/success.png');
     } else if (Type === "Error") {
        iconPath = await resolveResource('../src/assets/error.png');
     } else if (Type === "Warning") {
        iconPath = await resolveResource('../src/assets/warning.png');
     }
  } catch(e) {
    console.error("Resource couldn't resolve:", e);
  }

  await sendNotification({
    title: Title,
    body: Message,
    icon: iconPath, 
  });
}

async function closePIDList() {
  const windowElement = document.querySelector(".listofPIDwindow") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "none";
  }
}

async function backNotify() {
  const windowElement = document.querySelector(".notifydiv") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "none";
    CheckBoxNotify.checked = false;
    digitalAlart("Warning", "Notification settings were cancelled.", "Warning");
  }
}

async function saveWebhookSettings() {
  WebhookUrl= WebhookInput.value;
  if (WebhookUrl.trim() === "") {
    digitalAlart("Error", "Webhook URL cannot be empty.", "Error");
    return;
  }
  const windowElement = document.querySelector(".webhookdiv") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "none";
    digitalAlart("Success", "Webhook configured successfully.", "Success");
  }
}

async function closeWebhook() {
  const windowElement = document.querySelector(".webhookdiv") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "none";
    CheckBoxWebhook.checked = false;
    digitalAlart("Warning", "Webhook configuration was cancelled.", "Warning");
  }
}

async function openDocs() {
  const windowElement = document.querySelector(".docswindow") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "block";
  }
}

async function closeDocs() {
  const windowElement = document.querySelector(".docswindow") as HTMLDivElement;
  if (windowElement) {
    windowElement.style.display = "none";
  }
}

// Expose functions to the global scope
(window as any).Create = Create;
(window as any).digitalAlart = digitalAlart;
(window as any).FolderDialog = FolderDialog;
(window as any).checkPID = checkPID;
(window as any).listPID = listPID;
(window as any).infoPID = infoPID;
(window as any).closePIDList = closePIDList;
(window as any).backNotify = backNotify;
(window as any).closeWebhook = closeWebhook;
(window as any).saveWebhookSettings = saveWebhookSettings;
(window as any).openDocs = openDocs;
(window as any).closeDocs = closeDocs;
(window as any).saveNotifySettings = saveNotifySettings;

// Event Listeners

TriggerList.addEventListener("change", async () => {
  console.log("Selected trigger:", TriggerList.value);

  var FileTriggers = await invoke<string[]>("get_file_triggers");
  var AppTriggers = await invoke<string[]>("get_app_triggers");

  if (FileTriggers.includes(TriggerList.value)) {
    TriggerType = TriggerList.value;
    FileTriggerDiv.style.display = "block";
    AppTriggerDiv.style.display = "none";
    CreateTriggerBtn.style.display = "block";
    DocsBtn.style.display = "block";
  }

  else if (AppTriggers.includes(TriggerList.value)) {
    TriggerType = TriggerList.value;
    FileTriggerDiv.style.display = "none";
    AppTriggerDiv.style.display = "block";
    CreateTriggerBtn.style.display = "block";
    DocsBtn.style.display = "block";
  }

  else {
    TriggerType = "";
    FileTriggerDiv.style.display = "none";
    AppTriggerDiv.style.display = "none";
    CreateTriggerBtn.style.display = "none";
    DocsBtn.style.display = "none";
  }

});

PidList.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  if (target && target.classList.contains("pid-list-value")) {
    const selectedPID = target.dataset.pid;
    if (selectedPID) {
      TargetPIDInput.value = selectedPID;
      checkPID();
      await closePIDList();
    }
  }
});

CheckBoxShellScript.addEventListener("click", async () => {
  if (CheckBoxShellScript.checked) {
    const selectedFile = await open({
      multiple: false,
      title: "Select Shell Script",
      filters: [
        { name: "Shell Scripts", extensions: ["sh", "bat", "cmd", "py"] },
        { name: "All Files", extensions: ["*"] }
      ]
    }) as string;

    if (selectedFile) {
      ShellScriptPath = selectedFile;
      digitalAlart("Success", `Selected shell script: ${ShellScriptPath}`, "Success");
    } else {
      CheckBoxShellScript.checked = false;
      digitalAlart("Error", "No shell script selected. Please select a shell script to run on trigger.", "Error");
    }
  } else {
    ShellScriptPath = "";
  }
});

CheckBoxSound.addEventListener("click", async () => {
  if (CheckBoxSound.checked) {
    const selectedFile = await open({
      multiple: false,
      title: "Select Audio File",
      filters: [
        { name: "Audio Files", extensions: ["mp3", "wav", "ogg", "flac"] },
        { name: "All Files", extensions: ["*"] }
      ]
    }) as string;

    if (selectedFile) {
      SoundPath = selectedFile;
      digitalAlart("Success", `Selected audio file: ${SoundPath}`, "Success");
    } else {
      CheckBoxSound.checked = false;
      digitalAlart("Warning", "No audio file selected. Please select an audio file to play.", "Warning");
    }
  } else {
    SoundPath = "";
  }
});

CheckBoxNotify.addEventListener("click", async () => {
  if (CheckBoxNotify.checked) {
    let hasPermission = await isPermissionGranted();
    if (!hasPermission) {
      const permission = await requestPermission();
      if (permission !== "granted") {
        console.error("Notification permission denied");
        CheckBoxNotify.checked = false;
        digitalAlart("Error", "Notification permission denied. Please allow notifications to use this feature.", "Error");
        return;
      }
    }
    NotifyDiv.style.display = "block";
  }
  else {
    NotifyDiv.style.display = "none";
  }
});

CheckBoxWebhook.addEventListener("click", async () => {
  if (CheckBoxWebhook.checked) {
    WebhookDiv.style.display = "block";
  } else {
    WebhookDiv.style.display = "none";
  }
});

window.addEventListener("DOMContentLoaded", () => {
  invoke("get_all_triggers").then((triggers) => {
    const typedTriggers = triggers as string[];
    for (const trigger of typedTriggers) {
      TriggerList.add(new Option(trigger, trigger));
    }
  });
});
