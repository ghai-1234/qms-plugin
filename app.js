/**
 * Examples of the APIs provided by the HSPLUGIN system
 * @author Nachiket Kakatkar <nachiket@helpshift.com>
 * @created Oct 30, 2024
 */

/* eslint-disable */
// @TODO: feature/ext-plugins: Fix the eslinting for this before release
console.log("Are things OKAY ?", window.HSPLUGIN);
const statusInputEl = document.getElementById("status");
const agentInputEl = document.getElementById("agent");
const issueInputEl = document.getElementById("issue");
const userInputEl = document.getElementById("user");
const tokenInputEl = document.getElementById("token");
const visibilityInputEl = document.getElementById("visibility");

// Example of "login" API. This is used for invisible login of the user using
// the session of the host Helpshift dashboard, instead of having the agent
// login again separately into the plugin system
statusInputEl.innerText = window.HSPLUGIN ? "Plugin Loaded Successfully" : "Plugin Load Failed";

window.HSPLUGIN("login", {
  onSuccess: (data) => {
    console.log("Login Success ", data);
    tokenInputEl.value = data.token;
    issueInputEl.value = data.context.issueId;
    agentInputEl.value = data.agentEmail;

// Create a container to print params
const paramsContainer = document.createElement("div");
paramsContainer.style.marginTop = "20px";
const params = data.context.urlParamsFromParent;

const heading = document.createElement("h3");
heading.innerText = "URL Parameters";
paramsContainer.appendChild(heading);

// If no params
if ([...params.keys()].length === 0) {
  const p = document.createElement("p");
  p.innerText = "No URL parameters found.";
  paramsContainer.appendChild(p);
} else {
  params.forEach((value, key) => {
    const p = document.createElement("p");
    p.innerText = `${key} = ${value}`;
    paramsContainer.appendChild(p);
  });
}

// Attach to page
document.body.appendChild(paramsContainer);



  },
  onFailure: () => {
    console.log("Login failure");
    tokenInputEl.value = "Login Failed";
    issueInputEl.value = "";
    userInputEl.value = "";
  }
});

window.HSPLUGIN("addEventListener", {
  eventName: "plugin-shown",
  callback: (data) => {
    console.log("Receied event : plugin-shown ", data);
    issueInputEl.value = data.context.issueId;
    visibilityInputEl.value = "Shown";
  }
});

window.HSPLUGIN("addEventListener", {
  eventName: "plugin-hidden",
  callback: (data) => {
    console.log("Receied event : plugin-hidden ", data);
    visibilityInputEl.value = "Hidden";
  }
});


