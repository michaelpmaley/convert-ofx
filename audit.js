import csvjson from 'csvjson';
import fs from 'fs';
import os from 'os';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(utc);
//const stringSimilarity = require("string-similarity");
import stringSimilarity from 'string-similarity';

const DATABASEFILE = path.join(os.homedir(), 'Documents', 'Financial', 'transactions.csv');

(async () => {

   const database = csvjson.toObject(fs.readFileSync(DATABASEFILE).toString(), {delimiter: ',', quote: '"'});
   const databaseIds = database.filter(i => i.id !== null && i.id.trim() !== "").map(i => i.id);

   console.log("Categories ----------");
   const categoryList = ["Activities & Entertainment","Auto & Transport","Balance","Bills & Utilities","Business Services","Fees & Charges","Food & Dining","Gifts & Donations","Healthcare","Home","Income","Misc Expense","Personal Care","Shopping","Taxes","Transfer","Travel"];
   const categories = [...new Set(database.map(i => i.category).sort())];
   categories.forEach(category => {
      // console.log(category);
      if (categoryList.indexOf(category) === -1) {
         console.log(`INCORRECT: ${category}`);
      }
   });
   console.log("\n");

   console.log("Payee ----------");
   const payees = [...new Set(database.map(i => i.payee).sort())];
   payees.forEach(payee => {
      const payeeCategories = [...new Set(database.filter(i => i.payee === payee).map(i => i.category).sort())];
      //console.log(`${payee}: ${payeeCategories}`);
      if (payeeCategories.length > 1) {
         console.log(`MULTIPLE: ${payee}: ${payeeCategories}`);
      }
      if (payeeCategories[0] === "Misc Expense") {
         //console.log(`UNCATEGORIZED: ${payee}: ${payeeCategories}`);
      }
   });
   payees.forEach(payee => {
      var matches = stringSimilarity.findBestMatch(payee, payees);
      matches.ratings.forEach(match => {
         if (match.rating > .7 && match.rating != 1 && match.target.indexOf("airport") == -1) {
            console.log(`SIMILIAR: ${payee} ~= ${match.target}`);
         }
      });
   });
   console.log("\n");


})();
