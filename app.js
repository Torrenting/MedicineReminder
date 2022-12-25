const express = require("express");
const config = require('./config.json');
const client = require('twilio')(config["twilio-sid"], config["twilio-auth"]);
const xlsx = require('node-xlsx');
const fs = require("fs");
const app = express();
const port = config["port"];
const sheetPath = config["sheet-path"];
ensureSpreadsheetExists();
const spreadsheet = xlsx.parse(sheetPath);
const sheet = spreadsheet[0];
const rows = sheet['data'];
let intervalId;

const data = rows.reduce((acc, row, index) => {
    if (index === 0) {
        acc.keys = row;
    } else {
        const obj = row.reduce((obj, value, i) => {
            obj[acc.keys[i]] = value;
            return obj;
        }, {});
        acc.data.push(obj);
    }
    return acc;
}, { keys: [], data: [] });

app.listen(port, () => {
    console.log("Server running on port " + port);
    makeDailyReminder();
});

app.get("/take", (req, res, next) => {
    const now = new Date();
    const date = now.getFullYear()+'/'+(now.getMonth()+1)+'/'+now.getDate();
    if (!hasTaken(date)) {
            const newItem = {
                date: date,
                value: true
            };
            data.data.push(newItem);
            updateSheet();
            let responseJSON = {
                "response_status": "success",
                "result": "Medicine has been taken"
            }
            res.status(200).json(responseJSON);
        } else {
            let responseJSON = {
                "response_status": "error",
                "error": "ERR-MAT",
                "error_description": "Medication has already been taken today"
            }
            res.status(200).json(responseJSON);
        }

});

app.get("/check", (req, res, next)=> {
        let responseJSON = {
            "taken": hasTaken(new Date())
        }
        res.status(200).json(responseJSON);
});

function updateSheet() {
    const rows = data.data.map(item => {
        return [item.date, item.value];
    });
    rows.unshift(['date', 'value']);
    const newSpreadsheet = xlsx.build([{name: 'Sheet1', data: rows}]);
    fs.writeFileSync(sheetPath, newSpreadsheet, 'binary');
}

function hasTaken(date) {
    const d = new Date(date);
    const dN = d.getFullYear()+'/'+(d.getMonth()+1)+'/'+d.getDate();
    const item = data.data.find(item => item.date === dN);
    return item ? item.value : false;
}

function ensureSpreadsheetExists() {
    if (!fs.existsSync(sheetPath)) {
        console.log("No sheet found -> creating");
        const newSpreadsheet = xlsx.build([{ name: 'Sheet1', data: [] }]);

        fs.writeFileSync(sheetPath, newSpreadsheet, 'binary');
    } else {
        console.log("Spreadsheet found and loaded");
    }
}

function sendSMS() {
    client.messages
        .create({body: 'You have not taken your medicine yet! Please do so now.', from: config["twilio-from-number"], to: config["twilio-to-number"]})
        .catch(err => {console.log(err)});
}

function makeDailyReminder() {
    const targetTime = new Date();
    targetTime.setHours(config["reminder-hour"], 0, 0, 0);

    let milliseconds = targetTime - Date.now();

    if (milliseconds < 0) {
        milliseconds += 86400000; // 24 hours in milliseconds
    }
    setInterval(() => {
        const now = new Date();
        const date = now.getFullYear()+'/'+(now.getMonth()+1)+'/'+now.getDate();
        if(!hasTaken(date)) {
            sendSMS();
            intervalId = setInterval(hourlyReminder, 3600000);
        }
    }, milliseconds);
}

function hourlyReminder() {
    const now = new Date();
    const date = now.getFullYear()+'/'+(now.getMonth()+1)+'/'+now.getDate();
    if (hasTaken(date)) {
        clearInterval(intervalId);
    } else {
        sendSMS();
    }
}
