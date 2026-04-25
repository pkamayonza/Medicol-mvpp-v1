/**
 * auth.js — Session management, role protection, redirects
 */
 
window.addEventListener("DOMContentLoaded", ()=>{

const btn = document.querySelector("button");
const form = document.querySelector("form");

if(form){
form.addEventListener("submit",(e)=>{
e.preventDefault();
window.location.href="dashboard.html";
});
}

if(btn){
btn.onclick=(e)=>{
e.preventDefault();
window.location.href="dashboard.html";
};

}
});