const https = require('https')
const axios = require('axios');
const fs = require('fs');
const amqplib = require('amqplib');
const { v4: uuidv4 } = require("uuid");
const zlib = require('zlib');
const jwt = require('jsonwebtoken');
const pem = require("pem");
const base64url = require('base64url');

const process = {  
  env:{
    OMIE_LTS_APPID: '.v1',
    OMIE_LTS_HOST: '.es',
    OMIE_LTS_LOGIN_PATH: '/login',
    OMIE_LTS_SERVER_PORT: '5',
    OMIE_LTS_EXCHANGE: '.exchange',
    OMIE_LTS_PT_ZONE: 'W',
    WS_OMIE_PFX_FILEPATH: '.p12',
    WS_OMIE_PFX_PASSPHRASE: '0'
  }
}

async function login(){
  //we may change the certificate, so it makes sense to read each time to avoid restart whole app
  let pfxData = null
  try{
      pfxData = fs.readFileSync(process.env.WS_OMIE_PFX_FILEPATH);
  } catch(error){
      console.log(error);
      throw new Error(error, 'OMIE_LTS.login');
  }
  let omieCertificate = {
    pfx: pfxData,
    passphrase: process.env.WS_OMIE_PFX_PASSPHRASE
  }
  
  // return example: {agentID: 'x',  userRabbit: 'y',  passwordRabbit: 'pwd'}
  const url = 'https://' + process.env.OMIE_LTS_HOST + process.env.OMIE_LTS_LOGIN_PATH + '/' + Buffer.from(process.env.OMIE_LTS_APPID).toString('base64');
  return await axios.get(url,{        
      //headers: {"content-type": "application/json"},
      httpsAgent: new https.Agent(omieCertificate || {})
  });    
}

async function connect(login_info){
  //we may change the certificate, so it makes sense to read each time to avoid restart whole app
  let pfxData = null
  try{
      pfxData = fs.readFileSync(process.env.WS_OMIE_PFX_FILEPATH);
  } catch(error){
      console.log(error);
      throw new Error(error, 'OMIE_LTS.connect');
  }
  const opts = {
    rejectUnauthorized: false, //USE ONLY IN DEV (???)
    pfx: pfxData,
    passphrase: process.env.WS_OMIE_PFX_PASSPHRASE
  };
  const url = 'amqps://'+login_info.userRabbit+':'+login_info.passwordRabbit+'@'+process.env.OMIE_LTS_HOST+':'+process.env.OMIE_LTS_SERVER_PORT;
  return await amqplib.connect(url, opts);
}



/***************************************************************/
/****************** Inquiry Messages ***************************/

async function sendInquiryMessage(message, type, userRabbit, channel, queue){
  let options = {
    correlationId: uuidv4(),
    userId: userRabbit,
    type: type,
    replyTo: queue,
    appId: process.env.OMIE_LTS_APPID,
    contentType: 'application/json'
  };
  return await channel.publish(process.env.OMIE_LTS_EXCHANGE, 'inquiry', Buffer.from(JSON.stringify(message)), options)
}

async function getUserInfo(userRabbit, channel, queue){
  return await sendInquiryMessage(null,'UserInfo',userRabbit, channel, queue)
}

async function getMarketInfo(userRabbit, channel, queue){ 
  const message = {
    zone: process.env.OMIE_LTS_PT_ZONE
  };
  return await sendInquiryMessage(message,'MarketInfo',userRabbit, channel, queue)
}

async function getContractInfo(contractID, userRabbit, channel, queue){ 
  const message = {
    zone: process.env.OMIE_LTS_PT_ZONE,
    contractID: contractID
  };
  return await sendInquiryMessage(message,'ContractInfo',userRabbit, channel, queue)
}

async function getOrderInfo(orderID, userRabbit, channel, queue){ 
  const message = {
    orderID: orderID
  };
  return await sendInquiryMessage(message,'OrderInfo',userRabbit, channel, queue)
}

async function getOrderList(userRabbit, channel, queue){   
  return await sendInquiryMessage(null,'OrderList',userRabbit, channel, queue)
}

async function getTradeList(userRabbit, channel, queue){   
  return await sendInquiryMessage(null,'TradeList',userRabbit, channel, queue)
}

async function getAgentOrderLimits(userRabbit, channel, queue){ 
  return await sendInquiryMessage(null,'AgentOrderLimits',userRabbit, channel, queue)
}

async function getServerDateTime(userRabbit, channel, queue){ 
  return await sendInquiryMessage(null,'ServerDateTime',userRabbit, channel, queue)
}

// Lista de agentes
async function getReprList(userRabbit, channel, queue){ 
  return await sendInquiryMessage(null,'ReprList',userRabbit, channel, queue)
}

async function getOpLimitDetails(agentID, userRabbit, channel, queue){ 
  const message = {
    agentID: agentID
  };
  return await sendInquiryMessage(message,'OpLimitDetails',userRabbit, channel, queue)
}

async function getContractRefPrice(contractID, userRabbit, channel, queue){ 
  const message = {
    contractID: contractID,
    zone: process.env.OMIE_LTS_PT_ZONE    
  };
  return await sendInquiryMessage(message,'ContractRefPrice',userRabbit, channel, queue)
}

async function getMinimumTimeList(userRabbit, channel, queue){ 
  return await sendInquiryMessage(null,'MinimumTimeList',userRabbit, channel, queue)
}

async function getActiveMsgList(userRabbit, channel, queue){ 
  return await sendInquiryMessage(null,'ActiveMsgList',userRabbit, channel, queue)
}

/******************************************************************/
/****************** Management Messages ***************************/

async function sendManagementMessage(message, type, userRabbit, channel, queue){
  const options = {
    correlationId: uuidv4(),
    userId: userRabbit,
    type: type,
    replyTo: queue,
    appId: process.env.OMIE_LTS_APPID,
    contentType: 'application/json'
  };  
  const algorithm = 'RS256';
  let privateKey = '';

  try {
    privateKey = fs.readFileSync(process.env.WS_OMIE_PFX_FILEPATH);
  } catch(error){
    console.log(error);
    this.throwError(error, 'OMIE_LTS.sendManagementMessage');
  }

  pem.readPkcs12(privateKey, { p12Password: process.env.WS_OMIE_PFX_PASSPHRASE }, (error, cert) => {
    if (error) {
      throw error;
    }

    message_sign = jwt.sign(message, cert.key, 
      {algorithm: algorithm, 
      header: {alg: algorithm, typ: "JWT", x5c: [base64url(cert.ca[0])]  
      },  
    });
    //console.log(jwt.verify(message_sign, cert.ca[0], {algorithms: algorithm}));
    channel.publish(process.env.OMIE_LTS_EXCHANGE, "management", Buffer.from(message_sign), options)
  });
}

// max 100 orders
async function sendNewOrder(message, userRabbit, channel, queue){ 
  return await sendManagementMessage(message,'NewOrder',userRabbit, channel, queue)
}

// max 100 orders
async function sendCancelOrder(message, userRabbit, channel, queue){ 
  return await sendManagementMessage(message,'CancelOrder',userRabbit, channel, queue)
}

async function sendModifyOrder(message, userRabbit, channel, queue){ 
  return await sendManagementMessage(message,'ModifyOrder',userRabbit, channel, queue)
}

// max 100 orders
async function sendActivateOrder(message, userRabbit, channel, queue){ 
  return await sendManagementMessage(message,'ActivateOrder',userRabbit, channel, queue)
}

async function test(){
  const login_info = await login(); 
  const connection = await connect(login_info.data);
  console.log('connected!');
  const channel = await connection.createChannel();
  const channel2 = await connection.createChannel();
  let sQueue = await channel.assertQueue(null, {durable: false});
  

  channel2.consume(sQueue.queue, message => {
    if (message !== null) { 
      if(message.properties.contentEncoding.startsWith('gzip')) {
        // compressed data
        zlib.gunzip(message.content, (err, buffer) => {
          if (err) {
            // Reject the promise with the error.
            reject(err);
            return;
          } else {
            console.log(`Recebeu messagem da queue ${sQueue.queue}`)
            msg_obj = JSON.parse(buffer.toString())
            console.log(msg_obj);
            if (msg_obj.hasOwnProperty('responseStatus')){ //msg_obj.responseStatus.startsWith('ERR') 
              throw new Error(msg_obj.clientMessageType + " - " + msg_obj.responseCode + ": " + msg_obj.responseText, 'OMIE_LTS.consume');
            } 
          }
        });
      } else {
        // plaintext
        console.log(`Recebeu messagem da queue ${sQueue.queue}`)
        msg_obj = JSON.parse(message.content.toString())
        console.log(msg_obj)
        if (msg_obj.hasOwnProperty('responseStatus')){ //msg_obj.responseStatus.startsWith('ERR') 
          throw new Error(msg_obj.clientMessageType + " - " + msg_obj.responseCode+ ": " + msg_obj.responseText, 'OMIE_LTS.consume');
        } 
      }
      channel2.ack(message);
    }    
  })

  await getMarketInfo(login_info.data.userRabbit,channel, sQueue.queue)

  let message = {
    "orders": [
      {
      "agentID": "A",
      "message": "",
      "zone": "B",
      "unit": "C",
      "contractID": 0,
      "type": "C",
      "prc": 33.3,
      "qty": 5
      }
    ],
    "complexCondition": "None"
  }

  await sendNewOrder(message,login_info.data.userRabbit,channel, sQueue.queue)
  
  console.log("Fim teste");
}

test()
.catch(error => {
    console.error(error)
  })
