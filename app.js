
/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var path = require('path');
var request = require('request');
var fs = require('fs');

var app = express();

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.json());
app.use(express.urlencoded());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

function getProxy(vo, cb) {
	var robot_serial = '26581';
    var proxy_file = '/tmp/dchrp_proxy';
    var certificate_md5 = '876149964d57df2310eb3d398f905749';
    var attribute='/vo.dch-rp.eu';
    var server_url = "http://etokenserver.ct.infn.it:8082/eTokenServer/eToken/"  
    		+ certificate_md5 + "?voms=" + vo + ":" + attribute + "&proxy-renewal=false&disable-voms-proxy=true";
    console.log(server_url);
    request.get(server_url, function(error, response, body) {
    	if (!error && response.statusCode == 200) {
    		//console.log(body); // Print the google web page.
    		fs.writeFileSync(proxy_file, body, {mode: 0600});
    		cb(proxy_file);
  		}
    });

    	
}


app.all('/dav/:vo/:se/*', function(req, res) {
	var method = req.method
	console.log("method: " + method);
	var vo = req.param('vo');
	console.log("vo: " + vo);
	var se = req.param('se');
	console.log("se: " + se);
	var path = req.params[0];
	console.log("path: " + path);
	console.log("request header: " + JSON.stringify(req.headers));
	//console.log(req.path);
	//console.log(req.route);
	getProxy('vo.dch-rp.eu', function(proxy) {
		//console.log(proxy);
		proxydata = fs.readFileSync(proxy);
		var options = {
			url: "https://" + se + "/" + path,
			method: method,
			cert: proxydata,
			key: proxydata,
			strictSSL: false  
		};
		if (req.headers.depth) {
			options.headers = {
				'depth' : req.headers.depth
			};
		};
		request(options, function(err, response, body) {
			//console.log(err);
			console.log(response.statusCode);
			console.log(body);
			if (!err) {
				res.send(200, body);
			} else {
				console.log(err);
				res.send(500, err);
			}
		});
	});
	
});


http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
