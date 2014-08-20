#!/usr/bin/env node

var nopt = require('nopt'),
fs = require('fs'),
os = require('os'),
path = require('path'),
net = require('net'),
rimraf = require('rimraf'),
ncp = require('ncp'),
byline = require('byline'),
//bplist_create = require('bplist-creator'),
//bufferpack = require('bufferpack'),
minimatch = require('minimatch'),
child_process = require('child_process'),
appBuilderDir = path.join(os.tmpdir(), 'AppBuilder'),
packageLocation = path.join(appBuilderDir, 'package.zip'),
simulatedAppLocation,
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
        simulate(deviceFamily, function() { response.status(200).end(); });
    });

    archive.on('error', function (err) {
        console.error('Could not save the uploaded file. ' + err);              
    });

    request.pipe(archive);
}

function simulate(deviceFamily, successCallback){

    //guard if there is no app
    var appLocation = path.join(appBuilderDir, fs.readdirSync(appBuilderDir).filter(minimatch.filter("*.app"))[0]);
    //var appLocation = "/usr/local/tmp/Cordova350.app";
    var iosSim = child_process.spawn('ios-sim', ['launch', appLocation, '--family', deviceFamily, '--verbose']);
    iosSim.on('exit', function(code, signal){
        simulatedAppLocation = undefined;
    });

    // Application output is logged in stderr
    var outputPrefix = 'Simulated Application Location is: ';
    var lineStream = byline(iosSim.stderr);

    lineStream.on('data', function (line){
        var stringLine = line.toString(); 
            if(stringLine.indexOf(outputPrefix) == 0){
                var simulatedExecutableLocation = stringLine.substring(outputPrefix.length);
                simulatedAppLocation = path.join(path.dirname(simulatedExecutableLocation), 'www');
                successCallback();
            }
        });
}

function normalize(input){
    return input.replace('\\', path.sep);
}

function onRefreshRequest(request, response){
    // todo verbosity ?
    console.log('Refresh requested');
    var http = require('http');
    var options = {
      hostname: '127.0.0.1',
      port: 34534,
      path: '/refresh',
      method: 'GET'
    };

    var req = http.request(options, function(res) {
          res.setEncoding('utf8');
        });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    req.end();

    response.status(200).end();
}

function onSaveRequest(request, response){
    var fileRelativePath = normalize(request.params[0]);
    var filePath = path.join(simulatedAppLocation, fileRelativePath);

    var fileStream = fs.createWriteStream(filePath);
    request.pipe(fileStream);

    response.status(200).end();
}

function onDeleteRequest(request, response){
    var fileRelativePath = normalize(request.params[0]);
    var filePath = path.join(simulatedAppLocation, fileRelativePath);
    
    rimraf(filePath, onError);

    response.status(200).end();
}

function onRenameRequest(request, response){
    var oldRelativePath = normalize(request.params[0]);
    var oldPath = path.join(simulatedAppLocation, oldRelativePath);

    var newRelativePath = request.query.newPath.replace('\\', path.sep);
    var newPath = path.join(simulatedAppLocation, newRelativePath);

    fs.rename(oldPath, newPath, onError);

    response.status(200).end();
}

function onCreateDirectoryRequest(request, response){
    var relativePath = normalize(request.params[0]);
    var absolutePath = path.join(simulatedAppLocation, relativePath);

    fs.mkdir(absolutePath, onError);

    response.status(200).end();
}

function onCopyRequest(request, response){
    var sourceRelativePath = normalize(request.params[0]);
    var sourcePath = path.join(simulatedAppLocation, sourceRelativePath);

    var destinationRelativePath = request.query.destination.replace('\\', path.sep);
    var destinationPath = path.join(simulatedAppLocation, destinationRelativePath);

    ncp(sourcePath, destinationPath, onError);

    response.status(200).end();
}

function onError(error){
    if(error){
        console.error('An error has occured ' + error);
    }
}

(function run() {
    var cli_opts = nopt(known_opts),
        port = cli_opts.port;

    if (!port) {
        console.log(' --port <Specify port> ');

        process.exit(1);
    }

    // simulate('iphone');

    // var client = net.Socket({type: 'tcp6'});
    // client.connect(27753, '::1');


    // client.on('data', function(data){
    //     console.log(data.toString());
    // });

    // client.on('end', function(){
    //     console.log("end");
    // });

    // client.on('error', function(e){
    //     console.log(e);
    //})

// var msg = {
//         __argument: {
//             WIRConnectionIdentifierKey: '1234567',
//             WIRApplicationIdentifierKey: 'com.apple.mobilesafari'
//         },
//         __selector : '_rpc_forwardGetListing:'
//     };


// var plist = bplist_create(msg);
// client.write(bufferpack.pack('L', [plist.length]));
// client.write(plist);


    var express = require('express');
    var app = express();
    app.set('port', port);

    if(!fs.existsSync(appBuilderDir)) {
        fs.mkdir(appBuilderDir);
    }

    app.post('/launch', onSimulateRequest);
    app.post('/refresh', onRefreshRequest);

    //TODO we should use custom verbs in some places. 
    //Due to some firewall and proxy restrictions, we should implement some additional logic before that
    app.post('/storage/save/*', onSaveRequest);
    app.post('/storage/createDirectory/*', onCreateDirectoryRequest);
    app.delete('/storage/*', onDeleteRequest);
    app.put('/storage/rename/*', onRenameRequest);
    app.put('/storage/copy/*', onCopyRequest);

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
