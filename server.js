const express = require('express'),
	path = require('path'),
	fs = require('fs'),
	bodyParser = require('body-parser'),
	session = require('express-session'),
	jade = require('jade'),
    url = require('url'),
	cookieParser = require('cookie-parser');

var urlencodedParser = bodyParser.urlencoded({ extended: false });


var app = express();
var direct;
app.set('views', './views');
app.set('view engine', 'jade');
app.engine('jade', jade.__express);


app.listen(3000);


app.use(express.static('public'));
app.use(cookieParser());
app.use(session({
	secret: 'i have a little secret',
	resave: false,
	saveUninitialized: true,
	cookie: 120000
}));

//Landing login page
app.get('/', function (req, res) {
	res.sendFile(path.join(__dirname + "/auth.html"));
});


app.post('/process_post', urlencodedParser, function (req, res) {
	//check login credential
	if (req.body.uname == req.body.psw) {
		//Persist username for the session
		req.session.user = req.body.uname;

		//if remember me checkbox was checked, make cookie for login
		if (req.body.remember) {
			res.cookie('username', req.body.uname);
		}
		//if remember me checkbox was not checked clear cookie
		if (!req.body.remember) {
			res.clearCookie('username');
		}
		//-------------------------------------------------------------------------------
		//If user name is admin they are jumped to the tools screen
		if (req.body.uname == 'admin') {
			res.redirect('/tools');
		}
		//check if user is in the store and redirect to /matches
		else if (userExist(req.body.uname)) {
			res.redirect('/matches');
		} else {
			res.redirect('/survey/1');
		}
	} else {
		res.setHeader(403);
        res.send("Incorrect username or password. Go back an try again.");
	}
});


//survey question 1
app.all('/survey/1', function (req, res, next) {
	var temp = readJson('survey.json');

	app.locals.questionNum = 'Question 1';
	app.locals.question = temp[0].question;
	app.locals.nextQuestion = "/survey/2";
	app.locals.inputName = "name";
    
	//check if existing user to populate answer
	if (userExist(req.session.user)) {
		app.locals.previousAnswer = loadUserAnswer(req.session.user, 1);
	} else {
		app.locals.previousAnswer = "";
	}
	res.render('main_jade');
	next();
});

//survey question 2
app.all('/survey/2', urlencodedParser, function (req, res, next) {
	var temp = readJson('survey.json');
	var name;
	app.locals.questionNum = 'Question 2';
	app.locals.question = temp[1].question;
	app.locals.nextQuestion = "/survey/3";
	app.locals.inputName = "quest";

	if (userExist(req.session.user)) {
		app.locals.previousAnswer = loadUserAnswer(req.session.user, 2);
	} else {
		app.locals.previousAnswer = "";
	}
	if (req.method == "POST") {
		req.session.name = req.body.name;
	}
	res.render('main_jade');
	next();
});


//survey question 3
app.all('/survey/3', urlencodedParser, function (req, res, next) {
	var temp = readJson('survey.json');

	app.locals.questionNum = 'Question 3';
	app.locals.question = temp[2].question;
	app.locals.nextQuestion = "/survey/4";
	app.locals.inputName = "color";
    
	if (userExist(req.session.user)) {
		app.locals.previousAnswer = loadUserAnswer(req.session.user, 3);
	} else {
		app.locals.previousAnswer = "";
	}
	if (req.method == "POST") {
		req.session.quest = req.body.quest;
	}
	res.render('main_jade');
	next();
});


//survey question 4
app.all('/survey/4', urlencodedParser, function (req, res, next) {
	var temp = readJson('survey.json');
    
	app.locals.questionNum = 'Question 4';
	app.locals.question = temp[3].question;
	app.locals.nextQuestion = "/matches";
	app.locals.inputName = "capital";
    
	if (userExist(req.session.user)) {
		app.locals.previousAnswer = loadUserAnswer(req.session.user, 4);
	} else {
		app.locals.previousAnswer = "";
	}
	if (req.method == "POST") {
		req.session.color = req.body.color;
	} 
	res.render('main_jade');
	next();
});


//Still needs work------------------------------------------------
app.all('/matches', urlencodedParser, function (req, res, next) {
	//endpoint that renders the best partner matches based on survey results
	var temp = readJson('survey.json');
	var store = readJson('userstore.json');
	var newUser = [];
    
	if (req.method == "POST") {
        req.session.capital = req.body.capital;
		newUser = [req.session.name, req.session.quest, req.session.color, req.session.capital];
	}else if(req.method == "GET"){
		newUser = [store["andrew"].answer[0],store[req.session.user].answer[1], store[req.session.user].answer[2],store[req.session.user].answer[3]];
	}
    
    //Find matches for user
    var match = new Array();
    var count = 0;
    
    for (var k=1; k<temp.length; k++){
        for (var l=1; l<newUser.length; l++){
            if (removePunct(temp[l].answer[k-1]).toLowerCase() == removePunct(newUser[l]).toLowerCase()){
                count++;
            }
        }
        match.push({"user":temp[0].answer[k-1].toString(), "matches":count});
        count = 0;
    }
    
    bubbleSort(match);
    console.log(match);
    app.locals.bestMatch = JSON.stringify(match);

    //Add user to survey.json
    for (var j=0; j<temp.length; j++){
        temp[j].answer.push(newUser[j]);
    }
    writeJson(temp);
    
	res.render('matches_jade');
	res.end();
});


app.get('/login', function (req, res) {
	//Send user to login page
	res.redirect('/');
});


//Still needs work------------------------------------------------
app.get('/logout', function (req, res) {
	//Log user out and send back to login page
	//destroy every cookie in the session
	req.session.destroy();
	res.redirect('/');
});

app.get('/tools', function (req, res) {
	//endpoint for the admin functionality (6a) and should only be available to the admin.
    if (req.session.user !== 'admin'){
        res.status(401);
        res.send("Authorization required. Please try again.");
        res.redirect('/');
    }
    var temp = readJson('survey.json');
    var tempUsers = new Array();
    for (var i=0; i<temp[0].answer.length; i++){
        tempUsers.push(temp[0].answer[i]);
    }
    app.locals.survNum = temp[0].answer.length;
    app.locals.users = tempUsers;
    
	res.render('tools_jade');
});

app.get('/user/:userId', function (req, res){
    var temp = readJson('survey.json');
    var result = new Array();
    var name = req.params.userId;
    name = name.substr(1);
    
    for(var i=0; i<temp[0].answer.length; i++){
		if (name == temp[0].answer[i]){
			app.locals.user = name;
            app.locals.quest = temp[1].answer[i];
            app.locals.color = temp[2].answer[i];
            app.locals.capital = temp[3].answer[i];
        }
	}
    
    res.render('user_jade');
})

app.get('/deleteEntry/:userId', function (req, res){
    var temp = readJson('survey.json');
    var result = new Array();
    var name = req.params.userId;
    name = name.substr(1);
    
    for(var i=0; i<temp[0].answer.length; i++){
		if (name == temp[0].answer[i]){
            temp.splice(temp[0].answer[i]);
            temp.splice(temp[1].answer[i]);
            temp.splice(temp[2].answer[i]);
            temp.splice(temp[3].answer[i]);
        }
    }
    writeJson(temp);
})


//Read file in
function readJson(jsonFile) {
	try {
        var json = fs.readFileSync(jsonFile);
	    var survey = JSON.parse(json);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('File not found')
        } else {
            throw err;
        }
    }
	return survey;
}

//Write file
function writeJson(jsonFile) {
    try {
        fs.writeFileSync('survey.json', JSON.stringify(jsonFile));
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('File not found')
        } else {
            throw err;
        }
    }
    console.log("file written to survey.json");
}

//check if user exists in user store
function userExist(username) {
	var exists = false;
	var store = readJson('userstore.json');

	for (var i = 0; i < store.length; i++) {
		if (username == store[i].user) {
			exists = true;
		}
	}
	return exists;
}

/**
 * load a specific answer of a user
 */
function loadUserAnswer(username, answerNum) {
	var ans;
	var store = readJson('userstore.json');

	for (var i = 0; i < store.length; i++) {
		if (store[i].user == username) {
			ans = store[i].answer[answerNum - 1];
		}
	}
	return ans;
}

function removePunct(str){
     str = str.replace(/[.,\/#!$?%\^&\*;:{}=\-_`~()]/g,"");
     return str;
 }

function bubbleSort(arr){
   var len = arr.length;
   for (var i = len-1; i>=0; i--){
     for(var j = 1; j<=i; j++){
       if(arr[j-1].matches<arr[j].matches){
           var temp = arr[j-1];
           arr[j-1] = arr[j];
           arr[j] = temp;
        }
     }
   }
   return arr;
}