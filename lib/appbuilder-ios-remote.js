#!/usr/bin/env node

var nopt = require('nopt'),
fs = require('fs'),
os = require('os'),
path = require('path'),
minimatch = require('minimatch'),
child_process = require('child_process'),
appBuilderDir = path.join(os.tmpdir(), 'AppBuilder'),
packageLocation = path.join(appBuilderDir, 'package.zip'),
known_opts = {
        'port': Number,
        'exclude': Array,
        'debug' : Boolean
    };

function onSimulateRequest(request, response){
    console.log("launch simulator request received ... ");

    var archive = fs.createWriteStream(packageLocation);
    archive.on('finish', function () {            
        child_process.spawn('unzip', ['-uqo', packageLocation, '-d', appBuilderDir]);

        var deviceFamily = request.query.deviceFamily.toLowerCase();
        simulate(deviceFamily);
    });
    archive.on('error', function (err) {
        console.error('Could not save the uploaded file. ' + err);              
    });

    request.pipe(archive);
    response.status(200).end();
}

function simulate(deviceFamily){
    var appLocation = path.join(appBuilderDir, fs.readdirSync(appBuilderDir).filter(minimatch.filter("*.app"))[0]);

    child_process.spawn('ios-sim', ['launch', appLocation, '--family', deviceFamily]);
}

(function run() {
    var cli_opts = nopt(known_opts),
        port = cli_opts.port;

    if (!port) {
        console.log(' --port <Specify port> ');

        process.exit(1);
    }

    var express = require('express');
    var app = express();
    app.set('port', port);

    if(!fs.existsSync(appBuilderDir)) {
        fs.mkdir(appBuilderDir);
    }

    app.post('/launch', onSimulateRequest);

    process.on('uncaughtException', function (err) {
      console.error('****** Server will shutdown due to uncaught error ****** ' + err);
      console.error(err.stack);
    
      process.exit(1)
    });

    var shutdown = function() {
        console.info('****** Performing server shutdown procedures.');
       
        server.close();
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    var server = app.listen(port, function() {
        console.log('Listening on port %d', server.address().port);
    });
})();