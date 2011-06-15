(function (global, undefined) {
    "use strict";
    
    var path = require('path');

    console.log("nodejs module path: ", require.paths);
    console.log("");
    
    //get the forever module
    var forever = require("./lib/forever"),
		    emitter = path.join(__dirname, 'examples', 'server.js'),
        child;

    console.log("");   
    console.log("get the list:");
    console.log("forever.list(true)", forever.list(true));
    console.log("forever.list(false).length", (forever.list(false) || []).length);

    console.log("");
    console.log("Start emitter.js");
    
    child = new (forever.Forever)(emitter, { options: ['-p', '8080'] });
    
    //extend 
    child.__old__emit = child.emit;
    child.emit = function () {
        var eventname = arguments[0],
        	list;

        if (eventname != "newListener") {
        	list = forever.list(false) || [];
        	console.log("::  emiting: " + arguments[0]);
        	console.log("::  processors: ", list.length);
        }

        //console.dir(new Error().stack.split('\n'));
        return this.__old__emit.apply(this, arguments);
    };
    
    child.on("start", function () {
        console.log(">  emitter.js emits start");
        console.log(">  >  forever.list(true)", forever.list(true));
        console.log(">  >  forever.list(false).length", (forever.list(false) || []).length);
        console.log(">  stop emmiter.js");
        child.stop();
    });
    child.on("stop", function () {
        console.log(">  emitter.js emits stop"); 
        console.log(">  >  forever.list(true)", forever.list(true));
        console.log(">  >  forever.list(false).length", (forever.list(false) || []).length);
    });
    child.start();
    
})(global);