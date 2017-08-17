'use strict';
const EventEmitter = require('events');
const fetch = require('node-fetch');
const crypto = require('crypto');
const http = require('http');
const bodyParser = require('body-parser');


/* ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓　LineBot　Module　↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓*/

class LineBot extends EventEmitter {

	constructor(options) {
		super();
		this.options = options || {};
		this.options.channelId = options.channelId || '';
		this.options.channelSecret = options.channelSecret || '';
		this.options.channelAccessToken = options.channelAccessToken || '';
		if (this.options.verify === undefined) {
			this.options.verify = true;
		}
		this.headers = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
			Authorization: 'Bearer ' + this.options.channelAccessToken
		};
		this.endpoint = 'https://api.line.me/v2/bot';
	}

	verify(rawBody, signature) {
		const hash = crypto.createHmac('sha256', this.options.channelSecret)
			.update(rawBody, 'utf8')
			.digest('base64');
		return hash === signature;
	}

	parse(body) {
		const that = this;
		if (!body || !body.events) {
			return;
		}
		body.events.forEach(function (event) {
			event.reply = function (message) {
				return that.reply(event.replyToken, message);
			};
			if (event.source) {
				event.source.profile = function () {
					return that.getUserProfile(event.source.userId);
				};
			}
			if (event.message) {
				event.message.content = function () {
					return that.getMessageContent(event.message.id);
				};
			}
			process.nextTick(function () {
				that.emit(event.type, event);
			});
		});
	}

	static createMessages(message) {
		if (typeof message === 'string') {
			return [{ type: 'text', text: message }];
		}
		if (Array.isArray(message)) {
			return message.map(function (m) {
				if (typeof m === 'string') {
					return { type: 'text', text: m };
				}
				return m;
			});
		}
		return [message];
	}

	reply(replyToken, message) {
		const body = {
			replyToken: replyToken,
			messages: LineBot.createMessages(message)
		};
		return this.post('/message/reply', body).then(function (res) {
			return res.json();
		});
	}

	push(to, message) {
		if (Array.isArray(to)) {
			return Promise.all(to.map(recipient => this.push(recipient, message)));
		}
		const body = {
			to: to,
			messages: LineBot.createMessages(message)
		};
		return this.post('/message/push', body).then(function (res) {
			return res.json();
		});
	}

	multicast(to, message) {
		const body = {
			to: to,
			messages: LineBot.createMessages(message)
		};
		return this.post('/message/multicast', body).then(function (res) {
			return res.json();
		});
	}

	getUserProfile(userId) {
		return this.get('/profile/' + userId).then(function (res) {
			return res.json();
		});
	}

	getMessageContent(messageId) {
		return this.get('/message/' + messageId + '/content/').then(function (res) {
			return res.buffer();
		});
	}

	leaveGroup(groupId) {
		return this.post('/group/' + groupId + '/leave/').then(function (res) {
			return res.json();
		});
	}

	leaveRoom(roomId) {
		return this.post('/room/' + roomId + '/leave/').then(function (res) {
			return res.json();
		});
	}

	get(path) {
		return fetch(this.endpoint + path, { method: 'GET', headers: this.headers });
	}

	post(path, body) {
		return fetch(this.endpoint + path, { method: 'POST', headers: this.headers, body: JSON.stringify(body) });
	}

	// Optional Express.js middleware
	parser() {
		const parser = bodyParser.json({
			verify: function (req, res, buf, encoding) {
				req.rawBody = buf.toString(encoding);
			}
		});
		return (req, res) => {
			parser(req, res, () => {
				if (this.options.verify && !this.verify(req.rawBody, req.get('X-Line-Signature'))) {
					return res.sendStatus(400);
				}
				this.parse(req.body);
				return res.json({});
			});
		};
	}

	// Optional built-in http server
	listen(path, port, callback) {
		const parser = bodyParser.json({
			verify: function (req, res, buf, encoding) {
				req.rawBody = buf.toString(encoding);
			}
		});
		const server = http.createServer((req, res) => {
			const signature = req.headers['x-line-signature']; // Must be lowercase
			res.setHeader('X-Powered-By', 'linebot');
			if (req.method === 'POST' && req.url === path) {
				parser(req, res, () => {
					if (this.options.verify && !this.verify(req.rawBody, signature)) {
						res.statusCode = 400;
						res.setHeader('Content-Type', 'text/html; charset=utf-8');
						return res.end('Bad request');
					}
					this.parse(req.body);
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					return res.end('{}');
				});
			} else {
				res.statusCode = 404;
				res.setHeader('Content-Type', 'text/html; charset=utf-8');
				return res.end('Not found');
			}
		});
		return server.listen(port, callback);
	}

} // class LineBot

function createBot(options) {
	return new LineBot(options);
}

/* ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑LineBot　↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑　*/

// const linebot = require('./lib/linebot');
const line = require('@line/bot-sdk');
const express = require('express');

const defaultAccessToken = 'P8s5zjlQCYyAk+0tWOh/j4Y4hpWOVZUKHvc0B4vxRQLOSa3oAWMppDLCng0Iknp4ho4eAZubmyTylUzCURTJnsHXHM4JyQX+fA7xR5f4VttUNmu6mw1kkEtMOtCnDyefIDwdstekVoXNGpOLxXBNPgdB04t89/1O/w1cDnyilFU=';
const defaultSecret = '2503e921bcd8b6bdd9b63962ee357e9f';

// create LINE SDK config from env variables
const config = {
	channelId: process.env.CHANNEL_ID,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN || defaultAccessToken,
  channelSecret: process.env.CHANNEL_SECRET || defaultSecret,
};

// create LINE SDK client
const client = new line.Client(config);

// create Express app
// about Express itself: https://expressjs.com/
const app = express();

// 変数定義

  var cartArray = [];
      
const bot = new LineBot({
	channelId: process.env.CHANNEL_ID,
	channelSecret: process.env.CHANNEL_SECRET,
	channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
	verify: true // default=true
});

bot.on('message', function (event) {
	switch (event.message.type) {
		case 'text':
			switch (event.message.text) {
				case 'Me':
					event.source.profile().then(function (profile) {
						return event.reply('Hello ' + profile.displayName + ' ' + profile.userId);
					});
					break;
				case 'Picture':
					event.reply({
						type: 'image',
						originalContentUrl: 'https://d.line-scdn.net/stf/line-lp/family/en-US/190X190_line_me.png',
						previewImageUrl: 'https://d.line-scdn.net/stf/line-lp/family/en-US/190X190_line_me.png'
					});
					break;
				case 'Location':
					event.reply({
						type: 'location',
						title: 'LINE Plus Corporation',
						address: '1 Empire tower, Sathorn, Bangkok 10120, Thailand',
						latitude: 13.7202068,
						longitude: 100.5298698
					});
					break;
				case 'Push':
					bot.push('U6350b7606935db981705282747c82ee1', ['Hey!', 'สวัสดี ' + String.fromCharCode(0xD83D, 0xDE01)]);
					break;
				case 'Push2':
					bot.push(['U6350b7606935db981705282747c82ee1', 'U6350b7606935db981705282747c82ee1'], ['Hey!', 'สวัสดี ' + String.fromCharCode(0xD83D, 0xDE01)]);
					break;
				case 'Multicast':
					bot.push(['U6350b7606935db981705282747c82ee1', 'U6350b7606935db981705282747c82ee1'], 'Multicast!');
					break;
				case 'Confirm':
					event.reply({
						type: 'template',
						altText: 'this is a confirm template',
						template: {
							type: 'confirm',
							text: 'Are you sure?',
							actions: [{
								type: 'message',
								label: 'Yes',
								text: 'yes'
							}, {
								type: 'message',
								label: 'No',
								text: 'no'
							}]
						}
					});
					break;
				case 'Multiple':
					return event.reply(['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5']);
				// 	break;
				case 'Version':
					event.reply('linebot@' + require('../package.json').version);
					break;
				case 'rec':
				  var items = getTodayNew();
				  var echo = createCarousel(items);
					event.reply(echo);
					break;
				case 'buy':
          // goto cash? confirm message?
          // event.reply('current cart: ' + cartArray + ' and goto cash page');
					event.reply({
						type: 'template',
						altText: 'goto cash',
						template: {
							type: 'confirm',
							text: 'Are you sure goto cash?',
							actions: [{
								type: 'message',
								label: 'Yes',
								text: 'yes'
							}, {
								type: 'message',
								label: 'No',
								text: 'no'
							}]
						}
					});
					break;
				case 'find':
					event.reply('お気に入り魚の名前を入力してください。');
					break;
				case '鯛':
					event.reply({
          "type": "template",
          "altText": "This is a buttons template.",
          "template": {
              "type": "buttons",
              "thumbnailImageUrl": "https://example.com/bot/images/image.jpg",
              "title": "鯛のメッセージ",
              "text": "Please select",
              "actions": [
                  {
                    "type": "postback",
                    "label": "Buy",
                    "data": "action=buy&itemid=123"
                  },
                  {
                    "type": "postback",
                    "label": "Add to cart",
                    "data": "action=add&itemid=123"
                  },
                  {
                    "type": "uri",
                    "label": "View detail",
                    "uri": "http://example.com/page/123"
                  }
              ]
          }
        });
					break;
				default:
					event.reply(event.message.text).then(function (data) {
						console.log('Success', data);
					}).catch(function (error) {
						console.log('Error', error);
					});
					break;
			}
			break;
		case 'image':
			event.message.content().then(function (data) {
				const s = data.toString('base64').substring(0, 30);
				return event.reply('Nice picture! ' + s);
			}).catch(function (err) {
				return event.reply(err.toString());
			});
			break;
		case 'video':
			event.reply('Nice movie!');
			break;
		case 'audio':
			event.reply('Nice song!');
			break;
		case 'location':
			event.reply(['That\'s a good location!', 'Lat:' + event.message.latitude, 'Long:' + event.message.longitude]);
			break;
		case 'sticker':
			event.reply({
				type: 'sticker',
				packageId: 1,
				stickerId: 1
			});
			break;
		default:
			event.reply('Unknow message: ' + JSON.stringify(event));
			break;
	}
});

bot.on('follow', function (event) {
	event.reply('follow: ' + event.source.userId);
});

bot.on('unfollow', function (event) {
	event.reply('unfollow: ' + event.source.userId);
});

bot.on('join', function (event) {
	event.reply('join: ' + event.source.groupId);
});

bot.on('leave', function (event) {
	event.reply('leave: ' + event.source.groupId);
});

bot.on('postback', function (event) {
  
// 	event.reply('postback: ' + event.postback.data);
  
      var data_array = event.postback.data.split("&");

      if(data_array.length == 2){
          var actionName = data_array[0].split("=")[1];
          var itemId = data_array[1].split("=")[1];
          console.log(itemId );
          console.log(actionName );
          if(actionName== 'add'){
            cartArray.push(itemId);
            event.reply('current cart: ' + cartArray);
          }else if(actionName== 'buy'){
            //　first add to cart, goto cash? confirm message?
            event.reply('current cart: ' + cartArray + ' and goto cash page.?');
          }
      }
});

bot.on('beacon', function (event) {
	event.reply('beacon: ' + event.beacon.hwid);
});

bot.listen('/webhook', process.env.PORT || 80, function () {
  
	console.log('LineBot is running.');
});

/* get today's new items */
function getTodayNew(){
  
  var items = [{
      'id': '0001',
      'name': '鯛',
      'price': '550',
      'content': '北海道鯛'
    },{
      'id': '0002',
      'name': '鱈',
      'price': '750',
      'content': '北海道鯛２'
    },{
      'id': '0003',
      'name': 'ホタテ',
      'price': '350',
      'content': '北海道鯛３'
    },{
      'id': '0004',
      'name': 'スズキ',
      'price': '1,050',
      'content': '北海道鯛４'
    },{
      'id': '0003',
      'name': 'ホタテ',
      'price': '350',
      'content': '北海道鯛３'
    },{
      'id': '0004',
      'name': 'スズキ',
      'price': '1,050',
      'content': '北海道鯛４'
    },{
      'id': '0003',
      'name': 'ホタテ',
      'price': '350',
      'content': '北海道鯛３'
    },{
      'id': '0004',
      'name': 'スズキ',
      'price': '1,050',
      'content': '北海道鯛４'
    }];
    return items;
}

// Carousel情報の作成
function createCarousel(items) {
  var i, max,
      columns = [],
      itemsArray = [],
      messages = [];

  // Template messageのCarouselは5件までしか横にスライドできないので、複数メッセージを返す必要がある
  for (i = 0; i < items.length; i += 5) {
    itemsArray.push(items.slice(i, i + 4));
  }
  // columnsに5件ずつの複数のメッセージを作成
  for (i = 0, max = itemsArray.length; i < max; i++) {
    messages.push( {
      type: "template",
      altText: "今日のおすすめ一覧",
      template: {
        type: "carousel",
        columns: createColumns(itemsArray[i])
      }
    } );
  }

  return messages;
}
function createColumns(items) {
  var i, max,
      columns = [];

  for (i = 0, max = items.length; i < max && i < 5; i++) {
    columns.push({
      thumbnailImageUrl: "https://example.com/bot/images/item1.jpg",
      title: items[i].name + '　¥' + items[i].price,
      text: items[i].content,
      actions: [{            // ボタンの設定
        "type": "postback",
        "label": "Buy",
        "data": "action=buy&itemid=" + items[i].id
      },
      {
          "type": "postback",
          "label": "Add to cart",
          "data": "action=add&itemid=" + items[i].id
      },
      {
          "type": "uri",
          "label": "View detail",
          "uri": "http://example.com/page/" + items[i].id
      }]
    });
  }
  return columns;
}
