import { DEMO_MODE } from "./config.js";
import { mockAPI } from "./mock-api.js";

const BASE_URL = "http://127.0.0.1:8000";

async function realFetch(endpoint){
    const res = await fetch(BASE_URL + endpoint);
    return await res.json();
}

export const api = {

login(email,password){
    if(DEMO_MODE) return mockAPI.login(email,password);
},

getStats(){
    if(DEMO_MODE) return mockAPI.getStats();
    return realFetch("/stats");
},

getQueue(){
    if(DEMO_MODE) return mockAPI.getQueue();
    return realFetch("/visits/today");
},

getPatients(){
    if(DEMO_MODE) return mockAPI.getPatients();
    return realFetch("/patients");
},

getPrescriptions(){
    if(DEMO_MODE) return mockAPI.getPrescriptions();
    return realFetch("/prescriptions");
},

getPayments(){
    if(DEMO_MODE) return mockAPI.getPayments();
    return realFetch("/payments");
}

};

