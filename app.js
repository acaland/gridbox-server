/**
 * Module dependencies.
 */

var express = require('express');
var routes = require('./routes');
var http = require('http');
var https = require('https');
var path = require('path');
var request = require('request');
var fs = require('fs');
var pem = require('pem');

var app = express();

// all environments
app.set('port', process.env.PORT || 8080);
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

var config = JSON.parse(fs.readFileSync('config.json'));

var proxies = {};

function getProxy(vo, callback) {
	//console.log(proxies);
    if (proxies[vo] && proxies[vo].expiration > new Date().getTime()) {
    	//console.log('Proxy still valid');
        callback(proxies[vo].data);
    } else {
        //var robot_serial = '26581';
        //var proxy_file = '/tmp/dchrp_proxy';
        var proxy_file = config['robots'][vo]['proxy_file'] + "_gridbox";
        //var certificate_md5 = '876149964d57df2310eb3d398f905749';
        var certificate_md5 = config['robots'][vo]['md5'];
        //var attribute='/vo.dch-rp.eu';
        var attribute = config['robots'][vo]['attribute'];
        //var server_url = "http://etokenserver.ct.infn.it:8082/eTokenServer/eToken/"  
        //		+ certificate_md5 + "?voms=" + vo + ":" + attribute + "&proxy-renewal=false&disable-voms-proxy=true";
        var server_url = config['eTokenServer'] + certificate_md5 + "?voms=" + vo + ":" + attribute + "&proxy-renewal=false&disable-voms-proxy=true";

        //console.log("Server_URL:", server_url);
        console.log("Retrieving a proxy from eTokenServer for VO", vo);
        request.get(server_url, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                //console.log(body); // Print the google web page.
                proxies[vo] = {};
                proxies[vo].data = body;
                pem.readCertificateInfo(body, function(err, info) {
                	proxies[vo].expiration = info.validity.end;
                });
                callback(body);
                /*fs.writeFileSync(proxy_file, body, {
                    mode: 0600
                }); */
                
            }
        });
    }



}

app.put('/dav/:vo/:se/*', function(req, res) {
    console.log("PUT requested");
    var vo = req.param('vo');
    var se = req.param('se');
    var path = req.params[0];
    console.log("request header: " + JSON.stringify(req.headers));
    getProxy(vo, function(proxydata) {
        //proxydata = fs.readFileSync(proxy_file);
        var options = {
            hostname: se,
            port: 443,
            path: '/' + path,
            method: 'PUT',
            rejectUnauthorized: false,
            key: proxydata,
            cert: proxydata,
            headers: {
                'X-Auth-IP': req.ip
            }
        };
        var putReq = https.request(options, function(putRes) {
            console.log("statusCode: ", putRes.statusCode);
            console.log("headers: ", putRes.headers);

            if (putRes.statusCode == "307") {
                console.log("redirected to: ", putRes.headers.location);
                //res.set('location', putRes.headers.location);
                //res.set('expect','100-continue');
                //res.send(100);
                res.redirect(307, putRes.headers.location);
            }
            /*
  			putRes.on('data', function(d) {
    				//process.stdout.write(d);
				console.log("sono in end");
				console.log(d.toString());
				res.send(200, d);
  			});*/
        });
        putReq.end();

        putReq.on('error', function(e) {
            console.error(e);
            res.send(500, e);
        });
        //res.send(200);
    });
});

app.all('/dav/:vo/:se/*', function(req, res) {
    var method = req.method
    //console.log("method: " + method);
    var vo = req.param('vo');
    //console.log("vo: " + vo);
    var se = req.param('se');
    //console.log("se: " + se);
    var path = req.params[0];
    //console.log("path: " + path);
    console.log("client request headers:");
    console.log(req.headers);
    //console.log(req.path);
    //console.log(req.route);
    getProxy(vo, function(proxydata) {
        //console.log(proxy);
        //proxydata = fs.readFileSync(proxy_file);
        var options = {
            url: "https://" + se + "/" + path,
            method: method,
            cert: proxydata,
            key: proxydata,
            strictSSL: false
        };
        if (req.headers.depth) {
            options.headers = {
                'depth': req.headers.depth
            };
        };
        if (method == "GET" || method == "PUT") {
            options.followRedirect = false;
            options.followAllRedirects = false;
            console.log(req.ip);
            options.headers = {
                'X-Auth-IP': req.ip
            };
        };
        /*if (method =="PUT") {
			options.headers['expect'] = "100-continue";
		}; */
        //console.log(options);
        request(options, function(err, response, body) {

            //console.log(err);
            //console.log(response.statusCode);
            //console.log(response.headers);
            if (response.statusCode == "204") {
                console.log('204 from dpm');
                console.log(body);
            }
            //console.log(body);
            if (!err) {
                if (response.statusCode == "302") {
                    console.log("redirecting to ", response.headers.location);
                    res.redirect(response.headers.location);
                } else {
                    res.set(response.headers);
                    if (method == 'PROPFIND') {
                        var href = "/" + path;
                        var escapedHref = href.replace(/\//g, "\\/");
                        //console.log("href path = ", escapedHref);
                        var replHref = "/dav/" + vo + "/" + se + "/" + path;
                        //console.log("href replaced path = ", replHref);
                        var resp = body.replace(new RegExp(escapedHref, "g"), replHref);
                        //console.log("original body");
                        //console.log(body);
                        //console.log("replaced body");
                        //console.log(resp);
                        res.send(response.statusCode, body);
                    } else {
                        res.send(response.statusCode, body);
                    }
                    //console.log(body);
                }

            } else {
                console.log(err);
                res.send(500, err);
            }
        });
    });

});


http.createServer(app).listen(app.get('port'), function() {
    console.log('Express server listening on port ' + app.get('port'));
});