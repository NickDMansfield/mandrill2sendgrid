'use strict'

const fs = require('fs');

fs.readFile('./test/mandrill.json', 'utf8', function(err, val) {
  if (err) {
    console.log('Error reading your file.\r\n' + err);
  } else {
    fileLoaded(val);
  }
});

const fileLoaded = function(fileStringData) {
  console.log(fileStringData);
};
