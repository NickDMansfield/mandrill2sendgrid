'use strict'

const _ = require ('lodash');
const fs = require('fs');
let sendgridTemplate = {};
let mandrillTemplate = {};

fs.readFile('./test/mandrill.json', 'utf8', function(err, val) {
  if (err) {
    console.log('Error reading your file.\r\n' + err);
  } else {
    fileLoaded(val);
  }
});

const fileLoaded = function(fileStringData) {
  mandrillTemplate = JSON.parse(fileStringData);
  console.log(mandrillTemplate.message.to);
  sendgridTemplate = mandrillToSendgrid(mandrillTemplate);
  fs.writeFile('./test/sendGrid.json',JSON.stringify(sendgridTemplate, 0, 2), function(err) {
    if (err) {
      console.log('Error while writing.  ' + err);
    } else {
        console.log('Writing finished');
    }
  });
};

const mandrillToSendgrid = function(mandrillJSON, objToEdit) {
  const newObj = objToEdit || {};
  const msg = mandrillJSON.message;

  // Build personalizations/set 'to' objects
  newObj.personalizations = [];
  _.forEach(msg.to, to => {
    const p = {};
    p.to = [{ email: to.email, name: to.name }];
    newObj.personalizations.push(p);
  });

  newObj.from = objToEdit || {};
  newObj.from.email = msg.from_email;
  newObj.from.name = msg.from_name;

// Handle 'Reply To'
let replyToEmail = '';
let replyToName = '';
const reply = msg.headers['Reply-To'];
  if (reply) {
    if (typeof reply === 'Object') {
      replyToEmail = reply.email;
      replyToName = reply.name;
    } else {
      replyToEmail = reply;
      if (msg.from_email === replyToEmail) {
        replyToName = msg.from_name;
      }
    }
  }
  newObj.reply_to = { email: replyToEmail, name: replyToName };

  newObj.content = [];
  if (msg.html && msg.html.length > 0) {
    newObj.content.push({ type: 'text/html', value: msg.html });
  }
  if (msg.text && msg.text.length > 0) {
    newObj.content.push({ type: 'text/plain', value: msg.text });
  }

  if (msg.track_opens) {
    newObj.tracking_settings = newObj.tracking_settings || {};
    newObj.tracking_settings.open_tracking = newObj.tracking_settings.open_tracking || {};
    newObj.tracking_settings.open_tracking.enable = true;
    // TODO: Set substitution tags
  }
  if (msg.track_clicks) {
    newObj.tracking_settings = newObj.tracking_settings || {};
    newObj.tracking_settings.click_tracking = newObj.tracking_settings.click_tracking || {};
    newObj.tracking_settings.click_tracking.enable = true;
    // TODO: Set enable text
  }

  if (msg.bcc_address) {
    newObj.mail_settings = newObj.mail_settings || {};
    newObj.mail_settings.bcc = { enable: true, email: msg.bcc_address };
  }

  newObj.subject = msg.subject;
  newObj.headers = msg.headers;
  newObj.categories = msg.tags;
  newObj.send_at = mandrillJSON.send_at;

  return newObj;
};

const sendgridToMandrill = function(sendgridJSON, objToEdit) {
  const newObj = objToEdit || {};
  const msg = newObj.message || {};

  msg.to = msg.to || [];
  _.forEach(sendgridJSON.personalizations, p => {
    _.forEach(p.to, to => {
      if (!_.find(msg.to, t => { t.email === to.email })) {
        msg.to.push({ email: to.email, name: to. name });
      }
    });
  });

  msg.from_email = sendgridJSON.from.email;
  msg.from_name = sendgridJSON.from.name;

  msg.headers['Reply-To'] = sendgridJSON.reply_to.email || sendgridJSON.headers['Reply-To'] || sendgridJSON.from.email;

  const sgHtmlContent = _.find(sendgridJSON.content(c => {  c.type === 'text/html' }));
  if (sgHtmlContentl) {
    msg.html = sgHtmlContent.value;
  }
  const sgTextContent = _.find(sendgridJSON.content(c => {  c.type === 'text/plain' }));
  if (sgTextContent) {
    msg.text = sgTextContent.value;
  }

  if (sendgridJSON.tracking_settings) {
    msg.track_clicks = sendgridJSON.tracking_settings.click_tracking.enable || null;
  }
  if (sendgridJSON.tracking_settings) {
    msg.track_opens = sendgridJSON.tracking_settings.open_tracking.enable || null;
  }

  msg.subject = sendgridJSON.subject;
  msg.headers = sendgridJSON.headers;
  msg.categories = sendgridJSON.categories;
  newObj.send_at = sendgridJSON.send_at;

  newObj.message = msg;
  return newObj;
}
