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

interface TriggerOverview {
  name: string;
  state: boolean;
}

export interface OtherValues {
  Pid?: number;
  Path?: string;
  ProcessName?: string;
  CheckingInterval: number;
  SpamLimit: number;
  TriggerLimit?: number;
  WebhookUrl?: string;
}

type Actions = 
 | { Action: "Notify", ActionData: { Title: string, Message: string } }
 | { Action: "ShellScript", ActionData: { ScriptPath: string } }
 | { Action: "PlaySound", ActionData: { SoundPath: string } }
 | { Action: "Webhook", ActionData: { HookUrl: string, HookMessage: string } }



 // HTML values

const TriggerList = document.getElementById("triggerlist") as HTMLSelectElement;

const PidList = document.getElementById("pid-list") as HTMLUListElement;

const TargetFolderInput = document.getElementById("targetfolder") as HTMLInputElement;
const TargetFileInput = document.getElementById("targetfile") as HTMLInputElement;
const TargetPIDInput = document.getElementById("targetPID") as HTMLInputElement;
const CheckBoxShellScript = document.getElementById("runShellCheck") as HTMLInputElement;
const CheckBoxNotify = document.getElementById("showNotifCheck") as HTMLInputElement;
const CheckBoxSound = document.getElementById("soundPlayCheck") as HTMLInputElement;
const CheckBoxWebhook = document.getElementById("webhookCheck") as HTMLInputElement;
const advInput1 = document.getElementById("advInput1") as HTMLInputElement;
const advInput2 = document.getElementById("advInput2") as HTMLInputElement;
const triggernameInput = document.getElementById("nameinput") as HTMLInputElement;

const FileTriggerDiv = document.getElementById("FileTriggerDiv") as HTMLDivElement;
const AppTriggerDiv = document.getElementById("AppTriggerDiv") as HTMLDivElement;
const FolderTriggerDiv = document.getElementById("FolderTriggerDiv") as HTMLDivElement;
const NotifyDiv = document.getElementById("notifydiv") as HTMLDivElement;
const WebhookDiv = document.getElementById("webhookdiv") as HTMLDivElement;
const WebhookInput = document.getElementById("webhookinput") as HTMLInputElement;

const CreateTriggerBtn = document.getElementById("createTriggerBtn") as HTMLButtonElement;
const DocsBtn = document.getElementById("docsBtn") as HTMLButtonElement;
const ActiveTriggersList = document.getElementById("activeTriggersList") as HTMLDivElement;
const TriggerInfoWindow = document.querySelector(".triggerinfowindow") as HTMLDivElement;
const TriggerInfoContent = document.getElementById("triggerinfocontent") as HTMLTextAreaElement;

const PidTitle = document.getElementById("pidtitle") as HTMLHeadingElement;

const notifyTitleInput = document.getElementById("notifytitleinput") as HTMLInputElement;
const notifyMessageInput = document.getElementById("notifymessageinput") as HTMLInputElement;


// Variables

var TargetFolderValue = TargetFolderInput.value;
var TargetFileValue = TargetFileInput.value;
var TargetPIDValue = TargetPIDInput.value;
var TargetPIDName = Promise.resolve("");

var ConfirmedPID = false;
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

var activeInfoTriggerName = "";

// Functions

async function Create() {
  if (!TriggerType) {
    digitalAlart("Error", "Please select a trigger type.", "Error");
    return;
  }

  else {

    var FileTriggers = await invoke<string[]>("get_file_triggers");
    var FolderTriggers = await invoke<string[]>("get_folder_triggers");
    var AppTriggers = await invoke<string[]>("get_app_triggers");

    if (FolderTriggers.includes(TriggerType)) {
      
      // Validation of inputs and settings

      if (!(await invoke("checkpath", { path: TargetFolderValue }))) {
        digitalAlart("Error", "Target folder is not selected. Please select a target folder.", "Error");
        return;
      }

      SpamLimit = parseInt(advInput2.value) || 5;
      ScanPerSecond = parseFloat(advInput1.value) || 1.0;

      TriggerName = triggernameInput.value;

      if (!TriggerName.trim()) {
        digitalAlart("Error", "Trigger name cannot be empty. Please enter a name for the trigger.", "Error");
        return;
      }

      // If all validations are passed, create the trigger

      const selectedActions: Actions[] = [];

      if (CheckBoxNotify.checked) {
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

        selectedActions.push({
          Action: "Notify",
          ActionData: { Title: NotifyTitle, Message: NotifyMessage }
        });
      }

      if (CheckBoxShellScript.checked) {
        if (!ShellScriptPath) {
          digitalAlart("Error", "Shell script option is checked but no script is selected. Please select a shell script to run on trigger.", "Error");
          return;
        }

        selectedActions.push({
          Action: "ShellScript",
          ActionData: { ScriptPath: ShellScriptPath }
        });
      }
      
      if (CheckBoxSound.checked) {
        if (!SoundPath) {
          digitalAlart("Error", "Sound play option is checked but no audio file is selected. Please select an audio file to play on trigger.", "Error");
          return;
        }

        selectedActions.push({
          Action: "PlaySound",
          ActionData: { SoundPath: SoundPath }
        });
      }

      if (CheckBoxWebhook.checked) {
        WebhookUrl = WebhookInput.value;
        if (!WebhookUrl.trim()) {
          digitalAlart("Error", "Webhook option is checked but no URL is entered. Please enter a webhook URL.", "Error");
          return;
        }

        selectedActions.push({
          Action: "Webhook",
          ActionData: { HookUrl: WebhookUrl , HookMessage: (document.getElementById("webhookmessageinput") as HTMLInputElement).value }
        });
      }


      if (selectedActions.length === 0) {
        digitalAlart("Error", "At least one action must be selected (Notification, Shell Script, Sound Play, Webhook). Please select at least one action to perform when the trigger is activated.", "Error");
        return;
      }

      try {
        await invoke("create_trigger_handled", {
          name: TriggerName,
          triggerType: TriggerType,
          actions: selectedActions,
          otherValues: {
            Path: TargetFolderValue,
            CheckingInterval: ScanPerSecond,
            SpamLimit: SpamLimit
          }
        });
      } catch(e) {
        console.error(e);
        digitalAlart("Error", `${e}`, "Error");
        return;
      }

      digitalAlart("Success", `Trigger "${TriggerName}" created successfully!`, "Success");
      await refreshActiveTriggers();
      return;


    } else if (FileTriggers.includes(TriggerType)) {
      // Validation of inputs and settings

      if (!(await invoke("checkfile", { path: TargetFileValue }))) {
        digitalAlart("Error", "Target folder is not selected. Please select a target folder.", "Error");
        return;
      }

      SpamLimit = parseInt(advInput2.value) || 5;
      ScanPerSecond = parseFloat(advInput1.value) || 1.0;

      TriggerName = triggernameInput.value;

      if (!TriggerName.trim()) {
        digitalAlart("Error", "Trigger name cannot be empty. Please enter a name for the trigger.", "Error");
        return;
      }

      // If all validations are passed, create the trigger

      const selectedActions: Actions[] = [];

      if (CheckBoxNotify.checked) {
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

        selectedActions.push({
          Action: "Notify",
          ActionData: { Title: NotifyTitle, Message: NotifyMessage }
        });
      }

      if (CheckBoxShellScript.checked) {
        if (!ShellScriptPath) {
          digitalAlart("Error", "Shell script option is checked but no script is selected. Please select a shell script to run on trigger.", "Error");
          return;
        }

        selectedActions.push({
          Action: "ShellScript",
          ActionData: { ScriptPath: ShellScriptPath }
        });
      }
      
      if (CheckBoxSound.checked) {
        if (!SoundPath) {
          digitalAlart("Error", "Sound play option is checked but no audio file is selected. Please select an audio file to play on trigger.", "Error");
          return;
        }

        selectedActions.push({
          Action: "PlaySound",
          ActionData: { SoundPath: SoundPath }
        });
      }

      if (CheckBoxWebhook.checked) {
        WebhookUrl = WebhookInput.value;
        if (!WebhookUrl.trim()) {
          digitalAlart("Error", "Webhook option is checked but no URL is entered. Please enter a webhook URL.", "Error");
          return;
        }

        selectedActions.push({
          Action: "Webhook",
          ActionData: { HookUrl: WebhookUrl , HookMessage: (document.getElementById("webhookmessageinput") as HTMLInputElement).value }
        });
      }


      if (selectedActions.length === 0) {
        digitalAlart("Error", "At least one action must be selected (Notification, Shell Script, Sound Play, Webhook). Please select at least one action to perform when the trigger is activated.", "Error");
        return;
      }

      try {
        await invoke("create_trigger_handled", {
          name: TriggerName,
          triggerType: TriggerType,
          actions: selectedActions,
          otherValues: {
            Path: TargetFileValue,
            CheckingInterval: ScanPerSecond,
            SpamLimit: SpamLimit
          }
        });
      } catch(e) {
        console.error(e);
        digitalAlart("Error", `${e}`, "Error");
        return;
      }

      digitalAlart("Success", `Trigger "${TriggerName}" created successfully!`, "Success");
      await refreshActiveTriggers();
      return;

    } else if (AppTriggers.includes(TriggerType)) {
    

      
        // Validation of inputs and settings
        // yeah i know there is some differences in action checking between app and folder triggers.
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
          console.log("Webhook URL:", WebhookUrl);
          selectedActions.push({
            Action: "Webhook",
            ActionData: { HookUrl: WebhookUrl , HookMessage: (document.getElementById("webhookmessageinput") as HTMLInputElement).value }
          });
        }  


        try {
          await invoke("create_trigger_handled", {
            name: TriggerName,
            triggerType: TriggerType,
            actions: selectedActions,
            otherValues: {
              Pid: parseInt(TargetPIDValue),
              ProcessName: await TargetPIDName,
              CheckingInterval: ScanPerSecond,
              SpamLimit: SpamLimit
            }
          });
        } catch(e) {
          console.error(e);
          digitalAlart("Error", `${e}`, "Error");
          return;
        }

        digitalAlart("Success", `Trigger "${TriggerName}" created successfully!`, "Success");
        await refreshActiveTriggers();
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
      console.log("Selected folder:", TargetFolderInput.value);
  }

  else {
    TargetFolderInput.value = "";
    digitalAlart("Error", "No folder selected. Please select a target folder.", "Error");
  }
}


async function FileDialog() {
  TargetFileValue = await open({
    directory: false,
    multiple: false,
    title: "Select a Target File",
  }) as string;


  if (TargetFolderValue) {
    TargetFileInput.value = TargetFileValue;
      console.log("Selected file:", TargetFileInput.value);
  }

  else {
    TargetFileInput.value = "";
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

async function refreshActiveTriggers() {
  if (!ActiveTriggersList) {
    return;
  }

  try {
    const activeTriggers = await invoke<TriggerOverview[]>("get_active_triggers");
    ActiveTriggersList.innerHTML = "";

    if (activeTriggers.length === 0) {
      const emptyState = document.createElement("p");
      emptyState.className = "active-triggers-empty";
      emptyState.textContent = "No active triggers running.";
      ActiveTriggersList.appendChild(emptyState);
      return;
    }

    for (const triggerName of activeTriggers) {
      const item = document.createElement("div");
      item.className = "active-trigger-item";
      if (!triggerName.state) {
        item.classList.add("active-trigger-item--stopped");
      }

      const meta = document.createElement("div");
      meta.className = "active-trigger-meta";

      const name = document.createElement("p");
      name.className = "active-trigger-name";
      name.textContent = triggerName.name;

      const status = document.createElement("p");
      status.className = "active-trigger-status";
      status.textContent = triggerName.state ? "Running" : "Stopped";

      meta.appendChild(name);
      meta.appendChild(status);

      const actions = document.createElement("div");
      actions.className = "trigger-action-group";

      const infoButton = document.createElement("button");
      infoButton.type = "button";
      infoButton.className = "trigger-action-btn trigger-action-btn--info";
      infoButton.dataset.triggerAction = "info";
      infoButton.dataset.triggerName = triggerName.name;
      infoButton.textContent = "i";

      const stopButton = document.createElement("button");
      stopButton.type = "button";
      stopButton.className = "trigger-action-btn trigger-action-btn--stop";
      stopButton.dataset.triggerAction = "stop";
      stopButton.dataset.triggerName = triggerName.name;
      stopButton.textContent = "x";

      const startButton = document.createElement("button");
      startButton.type = "button";
      startButton.className = "trigger-action-btn trigger-action-btn--start";
      startButton.dataset.triggerAction = "start";
      startButton.dataset.triggerName = triggerName.name;
      startButton.textContent = "▶";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "trigger-action-btn trigger-action-btn--delete";
      deleteButton.dataset.triggerAction = "delete";
      deleteButton.dataset.triggerName = triggerName.name;
      deleteButton.textContent = "del";

      actions.appendChild(infoButton);
      actions.appendChild(startButton);
      actions.appendChild(stopButton);
      actions.appendChild(deleteButton);

      item.appendChild(meta);
      item.appendChild(actions);
      ActiveTriggersList.appendChild(item);
    }
  } catch (e) {
    console.error(e);
  }
}

async function stopTrigger(triggerName: string) {
  try {
    await invoke("stop_trigger", { name: triggerName });
    await refreshActiveTriggers();
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `${e}`, "Error");
  }
}

async function startTrigger(triggerName: string) {
  try {
    await invoke("start_trigger", { name: triggerName });
    await refreshActiveTriggers();
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `${e}`, "Error");
  }
}

async function deleteTrigger(triggerName: string) {
  try {
    await invoke("delete_trigger", { name: triggerName });
    await refreshActiveTriggers();
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `${e}`, "Error");
  }
}

async function openTriggerInfo(triggerName: string) {
  if (!TriggerInfoWindow || !TriggerInfoContent) {
    return;
  }

  try {
    const trigger = await invoke("get_trigger_details", { name: triggerName });
    TriggerInfoContent.value = JSON.stringify(trigger, null, 2);
    TriggerInfoWindow.style.display = "block";
    activeInfoTriggerName = triggerName;
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `${e}`, "Error");
  }
}

async function closeTriggerInfo() {
  if (TriggerInfoWindow) {
    TriggerInfoWindow.style.display = "none";
  }
}

async function saveTriggerInfo() {
  if (!TriggerInfoContent) {
    return;
  }

  try {
    const triggerDetails = JSON.parse(TriggerInfoContent.value);
    await invoke("update_trigger_details", { details: triggerDetails , oldName: activeInfoTriggerName });
    digitalAlart("Success", "Trigger details updated successfully.", "Success");
    await refreshActiveTriggers();
    await closeTriggerInfo();
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `Failed to update trigger details: ${e}`, "Error");
  }
}

async function reverseTriggerInfo() {
  // same method as openTriggerInfo but without changing the activeInfoTriggerName

  if (!TriggerInfoContent) {
    return;
  }

  try {
    const trigger = await invoke("get_trigger_details", { name: activeInfoTriggerName });
    
    // clearing the textarea before setting the value to avoid any residual data
    TriggerInfoContent.value = "";

    TriggerInfoContent.value = JSON.stringify(trigger, null, 2);
    TriggerInfoWindow.style.display = "block";
    activeInfoTriggerName = activeInfoTriggerName;
  } catch (e) {
    console.error(e);
    digitalAlart("Error", `${e}`, "Error");
  }
}

// Expose functions to the global scope
(window as any).Create = Create;
(window as any).digitalAlart = digitalAlart;
(window as any).FolderDialog = FolderDialog;
(window as any).FileDialog = FileDialog;
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
(window as any).stopTrigger = stopTrigger;
(window as any).startTrigger = startTrigger;
(window as any).deleteTrigger = deleteTrigger;
(window as any).openTriggerInfo = openTriggerInfo;
(window as any).closeTriggerInfo = closeTriggerInfo;
(window as any).saveTriggerInfo = saveTriggerInfo;
(window as any).reverseTriggerInfo = reverseTriggerInfo;

// Event Listeners

TriggerList.addEventListener("change", async () => {
  console.log("Selected trigger:", TriggerList.value);

  var FileTriggers = await invoke<string[]>("get_file_triggers");
  var AppTriggers = await invoke<string[]>("get_app_triggers");
  var FolderTriggers = await invoke<string[]>("get_folder_triggers");

  if (FileTriggers.includes(TriggerList.value)) {
    console.log("FİLE");
    TriggerType = TriggerList.value;
    FileTriggerDiv.style.display = "block";
    FolderTriggerDiv.style.display = "none";
    AppTriggerDiv.style.display = "none";

    CreateTriggerBtn.style.display = "block";
    DocsBtn.style.display = "block";
  }

  else if (AppTriggers.includes(TriggerList.value)) {
    console.log("APP");
    TriggerType = TriggerList.value;
    FileTriggerDiv.style.display = "none";
    FolderTriggerDiv.style.display = "none";
    AppTriggerDiv.style.display = "block";

    CreateTriggerBtn.style.display = "block";
    DocsBtn.style.display = "block";
  }

  else if (FolderTriggers.includes(TriggerList.value)) {
    console.log("FOLDER");
    TriggerType = TriggerList.value;
    FileTriggerDiv.style.display = "none";
    FolderTriggerDiv.style.display = "Block";
    AppTriggerDiv.style.display = "none";
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

  refreshActiveTriggers();
  window.setInterval(refreshActiveTriggers, 1000);
});

ActiveTriggersList.addEventListener("click", async (event) => {
  const target = event.target as HTMLElement;
  const stopButton = target.closest("button[data-trigger-name]") as HTMLButtonElement | null;

  if (!stopButton) {
    return;
  }

  const triggerName = stopButton.dataset.triggerName;
  const triggerAction = stopButton.dataset.triggerAction;

  if (triggerName && triggerAction) {
    if (triggerAction === "stop") {
      await stopTrigger(triggerName);
    } else if (triggerAction === "start") {
      await startTrigger(triggerName);
    } else if (triggerAction === "delete") {
      await deleteTrigger(triggerName);
    } else if (triggerAction === "info") {
      await openTriggerInfo(triggerName);
    }
  }
});
