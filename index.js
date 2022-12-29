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
const DATABASEBAKFILE = path.join(os.homedir(), 'Documents', 'Financial', 'transactions.bak');


const ACCOUNTTYPE = {
   BANK: "Checking",
   CREDITCARD: "Credit Card"
};
Object.freeze(ACCOUNTTYPE);


const parseOfxDate = ((ofxDate) => {
   // 20221003120000[0:GMT]    20221001000000.000[-7:MST]
   const d = ofxDate.slice(0, ofxDate.indexOf('['));
   const z = ofxDate.slice(ofxDate.indexOf('[')+1, ofxDate.indexOf(':'));
   const date = dayjs.utc(d).utcOffset(z);
   return date;
});

const computeInstitution = ((org) => {
   switch (org.toString().toUpperCase()) {
      case 'B1': return 'CHASE';
      default: return org;
   }
});

const computeDefaultCategory = ((type) => {
   return type === 'CREDIT' ? 'Income' : 'Misc Expense';
});

const computeMemo = ((accountType, payee, memo) => {
   if (accountType === ACCOUNTTYPE.BANK) {
      if (!memo) {
         // check: payee
         return payee;
      } else {
         // debit,credit: payee + memo
         return payee + ' ' + memo;
      }
   } else {
      return memo || ' ';
   }
});

(async () => {
   const mappings = JSON.parse(fs.readFileSync(MAPPINGSFILE).toString());
   const mappingKeys = Object.keys(mappings);

   fs.copyFileSync(DATABASEFILE, DATABASEBAKFILE);
   const database = csvjson.toObject(fs.readFileSync(DATABASEFILE).toString(), {delimiter: ',', quote: '"'});
   const databaseIds = database.filter(i => i.id !== null && i.id.trim() !== "").map(i => i.id);

   const folder = DOWNLOADSFOLDER;
   for (const file of fs.readdirSync(folder)) {
      if (!file.toLowerCase().endsWith('.qfx') || file.toLowerCase().includes('patched')) {
         console.log(`SKIPPING: ${file}`);
         continue;
      }

      // 1. read ofx file
      const ofxFile = path.join(folder, file);
      const ofxData = await parseOFX(fs.readFileSync(ofxFile).toString());
      const institution = computeInstitution(ofxData.OFX.SIGNONMSGSRSV1.SONRS.FI.ORG);
      const accountType = ofxData.OFX.BANKMSGSRSV1 ? ACCOUNTTYPE.BANK : ACCOUNTTYPE.CREDITCARD;
      const statement = accountType === ACCOUNTTYPE.BANK ? ofxData.OFX.BANKMSGSRSV1.STMTTRNRS.STMTRS : ofxData.OFX.CREDITCARDMSGSRSV1.CCSTMTTRNRS.CCSTMTRS;
      const accountId = accountType === ACCOUNTTYPE.BANK ? statement.BANKACCTFROM.ACCTID : statement.CCACCTFROM.ACCTID;
      const dateStart = parseOfxDate(statement.BANKTRANLIST.DTSTART);
      const dateEnd = parseOfxDate(statement.BANKTRANLIST.DTEND);
      const ofxTransactions = statement.BANKTRANLIST.STMTTRN;

      // 2. process transactions
      const transactions = [];
      for (const ofxTransaction of ofxTransactions) {
         // NOTE: property names must match databaseColumns names
         const transaction = {
            date: parseOfxDate(ofxTransaction.DTPOSTED).format('YYYY-MM-DD'),
            payee: ofxTransaction.NAME,
            category: computeDefaultCategory(ofxTransaction.TRNTYPE),
            amount: ofxTransaction.TRNAMT,
            notes: computeMemo(accountType, ofxTransaction.NAME, ofxTransaction.MEMO),
            checknum: ofxTransaction.CHECKNUM || '',
            institution: institution,
            type: ofxTransaction.TRNTYPE,
            id: ofxTransaction.FITID
         };

         // 2.a. if it already exists, skip
         if (databaseIds.includes(transaction.id)) {
            console.log(`ALREADY EXISTS: ${transaction.date}, ${transaction.payee}, ${transaction.amount}, ${transaction.id}`);
            continue;
         }

         // 2.b. remap payee and category
         mappingKeys.find(mappingKey => {
            const re = new RegExp(mappingKey);
            if (re.test(transaction.payee) || re.test(transaction.notes)) {
               transaction.payee = mappings[mappingKey].payee;
               transaction.category = mappings[mappingKey].category;
            }
         });

         // 2.c. save
         transactions.push(transaction);
         database.push(transaction); // will sort it later
      }

      // 3. create csv file
      const csvFile = path.join(folder, `${institution}-${dateStart.format('YYYYMMDD')}-${dateEnd.format('YYYYMMDD')}-patched.csv`);
      const csvHeaders = 'Date,Payee,Category,Amount,Notes,CheckNum,Institution,Type,Id';
      const csvData = csvHeaders + csvjson.toCSV(transactions, {delimiter: ',', headers: 'none'}) + '\n';
      fs.writeFileSync(csvFile, csvData);
   }

   const databaseColumns = 'date,payee,category,amount,notes,checknum,institution,type,id';
   database.sort((a,b) => b.date.localeCompare(a.date));
   const databaseData = databaseColumns + csvjson.toCSV(database, {delimiter: ',', headers: 'none'}) + '\n';
   fs.writeFileSync(DATABASEFILE, databaseData);
})();
