import {parse as parseOFX} from 'ofx-js';
import csvjson from 'csvjson';
import fs from 'fs';
import os from 'os';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);

const DOWNLOADSFOLDER = path.join(os.homedir(), 'Downloads');
const MAPPINGSFILE = path.join(os.homedir(), 'Documents', 'Financial', 'transaction-mappings.json');
const DATABASEFILE = path.join(os.homedir(), 'Documents', 'Financial', 'transactions.csv');
const DATABASEBACKFILLLEDFILE = path.join(os.homedir(), 'Downloads', 'transactions-backfilled.csv');

/***
 * Use this script to manually update the database file. Mostly likely needs to be edited before use.
 * 1. download a historic qfx file
 * 2. in index.js, temporarily comment out lines 60, 101, 128
 * 3. execute npm run start (convert it)
 * 4. in this file, create/alter matching option
 * 5. execute npm run backfill
 * 6. compare backfilled database to the real one
 * 7. if good, overwrite
 */

(async () => {
   const database = csvjson.toObject(fs.readFileSync(DATABASEFILE).toString(), {delimiter: ',', quote: '"'});
   const databaseIds = database.filter(i => i.id !== null && i.id.trim() !== "").map(i => i.id);

   const folder = DOWNLOADSFOLDER;
   for (const file of fs.readdirSync(folder)) {
      if (!file.toLowerCase().endsWith('patched.csv')) {
         console.log(`SKIPPING: ${file}`);
         continue;
      }
      console.log(`PROCESSING: ${file}`);

      // 1. read csv file
      const ofxFile = path.join(folder, file);
      const ofxTransactions = csvjson.toObject(fs.readFileSync(ofxFile).toString(), {delimiter: ',', quote: '"'});

      // 2. safety check - analyze dates with transactions that have the same amount
      const badDates = [];
      const dateAmountMap = ofxTransactions.reduce((acc, e) => {
         const key = e["Date"];
         const group = acc[key] ?? [];
         return { ...acc, [key]: [...group, e.Amount] };
      }, {});
      for (const date of Object.keys(dateAmountMap)) {
         const amounts = dateAmountMap[date];
         const hasDuplicates = (new Set(amounts)).size !== amounts.length
         if (hasDuplicates) {
            badDates.push(date);
            console.log(`${date}: ${amounts.sort((a,b) => a.localeCompare(b))}`);
         }
      }
      //console.log(badDates);

      // 3. process transactions
      for (const ofxTransaction of ofxTransactions) {
         // OPTION A - to backfile notes, checknum, and id
         //const transaction = database.find(e => {
         //   return e.date === ofxTransaction.Date
         //   && e.amount === ofxTransaction.Amount
         //   && e.notes === ''
         //   && e.id === '';
         //});

         // OPTION B - to backfill notes and checknum
         const transaction = database.find(e => {
            return e.id === ofxTransaction.Id;
         })

         // 3.a. if we couldn't find a match, then skip it; shouldn't happen
         if (!transaction) {
            console.log(`DNE: ${JSON.stringify(ofxTransaction)}`);
            continue;
         }

         // 3.b. OPTION A if it is a multiple date/amount, then skip it for manual editing
         //const count = (dateAmountMap[transaction.date]).reduce((acc, obj) => {return obj === transaction.amount ? acc + 1 : acc;}, 0);
         //if (count > 1) {
         //   console.log(`SKIPPING: ${JSON.stringify(ofxTransaction)}`);
         //   continue;
         //}

         // 3.c. update transaction
         //console.log(`${transaction.date}, ${transaction.amount}, ${transaction.payee} | ${ofxTransaction.Payee}, ${ofxTransaction.Notes}, ${ofxTransaction.CheckNum}, ${ofxTransaction.Id}`);
         transaction.notes = ofxTransaction.Notes;
         transaction.checknum = ofxTransaction.CheckNum;
         transaction.id = ofxTransaction.Id;
      }

   }

   const databaseColumns = 'date,payee,category,amount,notes,checknum,institution,type,id';
   database.sort((a,b) => b.date.localeCompare(a.date));
   const databaseData = databaseColumns + csvjson.toCSV(database, {delimiter: ',', headers: 'none'}) + '\n';
   fs.writeFileSync(DATABASEBACKFILLLEDFILE, databaseData);
})();
