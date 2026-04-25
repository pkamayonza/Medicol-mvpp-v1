export const mockAPI = {

async login(email, password){
    return {
        token:"demo-token",
        user:{
            name:"Patience",
            role:"Admin",
            email
        }
    };
},

async getStats(){
    return {
        total_today:14,
        waiting:6,
        in_consult:2,
        completed:8,
        revenue:850000
    };
},

async getQueue(){
    return [
        {name:"Sarah Namuli", status:"Waiting"},
        {name:"John Kato", status:"Waiting"},
        {name:"Amina Nansubuga", status:"In Consult"},
        {name:"Peter Mugisha", status:"Completed"}
    ];
},

async getPatients(){
    return [
        {name:"Sarah Namuli", phone:"0701234567"},
        {name:"John Kato", phone:"0759876543"},
        {name:"Amina Nansubuga", phone:"0783456789"}
    ];
},

async getPrescriptions(){
    return [
        {patient:"Sarah Namuli", drug:"Amoxicillin", status:"Pending"},
        {patient:"John Kato", drug:"Paracetamol", status:"Dispensed"}
    ];
},

async getPayments(){
    return [
        {patient:"Sarah Namuli", amount:"UGX 35,000"},
        {patient:"John Kato", amount:"UGX 18,000"}
    ];
}

};