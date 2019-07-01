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
        console.log('M -> SG Writing finished');
        fs.writeFile('./test/s2m.json', JSON.stringify(sendgridToMandrill(sendgridTemplate), 0, 2), function(err) {
          if (err) {
            console.log('Error converting sendgrid to mandrill');
          } else {
            console.log('Sendgrid to mandrill conversion complete.');
          }
        })
    }
  });
};

const mandrillVarsToSendGrid = function (mandrillVars) {
  const ret = {};
  _.forEach(mandrillVars, mv => {
    ret[mv.name] = mv.content;
  });
  return ret;
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

  // Build the global merge vars into a generic base object
  const globalMergeVars = mandrillVarsToSendGrid(msg.global_merge_vars);

  // Map the custom data on a user-basis for assignment in personalizations
  const userMergeVars = {};
  _.forEach(msg.merge_vars, mv => {
    if (mv.rcpt) {
      userMergeVars[mv.rcpt] = mandrillVarsToSendGrid(mv.vars);
    }
  });

  // Assigns the dynamic template data to each recipient
  _.forEach(newObj.personalizations, p => {
    // We use a hard [0] because presently each personalization is tied to one 'to'
    const newDTData = _.assign(p.dynamic_template_data || {}, globalMergeVars, userMergeVars[p.to[0].email]);
    p.dynamic_template_data = newDTData;
  });

  newObj.subject = msg.subject;
  newObj.headers = msg.headers;
  newObj.categories = msg.tags;
  newObj.send_at = mandrillJSON.send_at;

  return newObj;
};

const sendgridToMandrill = function(sendgridJSON, objToEdit) {
  const newObj = objToEdit || {};
  const msg = newObj.message || {};
  let globalMergeVars = msg.global_merge_vars || [];
  let mergeVars = msg.merge_vars || [];
  let tempMergeVars = [];

  msg.to = msg.to || [];
  _.forEach(sendgridJSON.personalizations, p => {
    _.forEach(p.to, to => {
      if (!_.find(msg.to, t => { t.email === to.email })) {
        msg.to.push({ email: to.email, name: to. name });
        _.forIn(p.dynamic_template_data, (key, value) => {
          tempMergeVars.push({ rcpt: to.email, name: value, content: key });
        });
      }
    });
  });

  _.forEach(tempMergeVars, tmv => {
    if (!tmv || _.find(globalMergeVars, gmv => { return gmv.name === tmv.name})) {
      return;
    }
    if (tempMergeVars.filter(_tmv =>  _tmv.content === tmv.content && _tmv.name === tmv.name).length === msg.to.length) {
      globalMergeVars.push({ name: tmv.name, content: tmv.content });
    } else {
      let rcptData = _.find(mergeVars, mv =>  mv.rcpt === tmv.rcpt );
      if (!rcptData) {
        rcptData = { rcpt: tmv.rcpt, vars: [] };
        mergeVars.push(rcptData);
      }
      rcptData.vars.push({ name: tmv.name, content: tmv.content});
    }
  });
  if (globalMergeVars || mergeVars) {
    msg.merge = true;
    msg.global_merge_vars = globalMergeVars;
    msg.merge_vars = mergeVars;
  }

  msg.from_email = sendgridJSON.from.email;
  msg.from_name = sendgridJSON.from.name;

  if (!msg.headers) {
    msg.headers = [];
  }
  msg.headers['Reply-To'] = sendgridJSON.reply_to.email || (sendGridJSON.headers && sendgridJSON.headers['Reply-To']) || sendgridJSON.from.email;

  if (sendgridJSON.content) {
    const sgHtmlContent = _.find(sendgridJSON.content, c => {  c.type === 'text/html' });
    if (sgHtmlContent) {
      msg.html = sgHtmlContent.value;
    }
    const sgTextContent = _.find(sendgridJSON.content, c => {  c.type === 'text/plain' });
    if (sgTextContent) {
      msg.text = sgTextContent.value;
    }
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
