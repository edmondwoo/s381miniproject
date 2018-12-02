var MongoClient = require('mongodb').MongoClient; 
var assert = require('assert');
var ObjectId = require('mongodb').ObjectID;
var mongourl = 'mongodb://demo:demo123@ds123454.mlab.com:23454/381project';

var fs = require('fs');
var formidable = require('formidable');

var express = require('express');
var session = require('cookie-session');
var bodyParser = require('body-parser');
var app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var SECRETKEY1 = 'I want to pass COMPS381F';
var SECRETKEY2 = 'Keep this to yourself';

app.use(session({
  name: 'session',
  keys: [SECRETKEY1,SECRETKEY2]
}));

app.get('/',function(req,res){
	if (!req.session.authenticated) {
		res.redirect('/login');
	} else {
		//res.status(200);
		//res.render('main',{user:req.session.username});
		read_n_print(res,req,{},-1);
		//res.render('secrets',{name:req.session.username});
		//res.end();
	}
});

app.get('/change',function(req,res){
	var criteria = {_id:ObjectId(req.query._id)};
		MongoClient.connect(mongourl,function(err,db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		findRestaurants(db,criteria,1,function(restaurant){
			var owner = restaurant[0].owner;
			if(owner != req.session.username){
				res.render('owner');
			}
		});
		
		
	});
	
	MongoClient.connect(mongourl,function(err,db) {
		findRestaurants(db,{_id:ObjectId(req.query._id)},1,function(r){
				res.render("change.ejs",{
					r:r
				});
		});
	});
});
app.post('/change',function(req,res){
	update(res,req);
});


app.get('/search',function(req,res){
	if (req.session.authenticated) {
        res.render("search.ejs");
    }else{
        res.render("login.ejs",{wrong:false});
    }
});
app.post('/search',function(req,res){
	search(res,req);
});

app.get('/new',function(req,res){
    if (req.session.authenticated) {
        res.render('new');
    }else{
        res.render("login.ejs",{wrong:false});
    }
});
app.post('/new',function(req,res){
    if (req.session.authenticated) {
        create(res,req);
    }else{
        res.render("login.ejs",{wrong:false});
    }
});

app.post('/login',function(req,res) {
	checkLogin(req,res,{"name":req.body.name,"password":req.body.password});
});
app.get('/display',function(req,res){
    if (req.session.authenticated) {
		displayRestaurant(res,req.query._id);
	}else{
	    res.render("login.ejs",{wrong:false});
	}
});
app.get('/login',function(req,res){
    if (req.session.authenticated) {
		res.redirect('/');
	}else{
	    res.render("login.ejs",{wrong:false});
	}
});

app.get('/logout',function(req,res){
    req.session = null;
	res.redirect('/');
});

app.get("/gmap", function(req,res) {
	res.render("gmap.ejs", {
		lat:req.query.lat,
		lon:req.query.lon,
		zoom:req.query.zoom
	});
	res.end();
});

app.get("/remove",function(req,res){
	if (req.session.authenticated) {
		remove(res,req,{_id:ObjectId(req.query._id)});
	}else{
	    res.render("login.ejs",{wrong:false});
	}
});

app.get('/rate',function(req,res){
	res.render('rate',{_id:req.query._id});
	
});

app.post('/rate',function(req,res){
	MongoClient.connect(mongourl,function(err,db) {
			var criteria = {_id:ObjectId(req.query._id)};
			findRestaurants(db,criteria,1,function(r){
				if(r[0].grades==null){
					var grades = [];
					grades.push({'user':req.session.username,'score':req.body.rate});
					//grades["user"] = req.session.username;
					//grades["score"] = req.body.rate;
					var new_v = {};
					new_v['grades'] = grades;
					updateRestaurant(db,criteria,new_v,function(r){
						s.render('rated.ejs',{_id:req.query._id,rate:true});
					});
				}else{
					var grades = r[0].grades;
					var flag = 0;
					for(var i = 0;i<grades.length;i++){
						var g = grades[i];
						if(g.user == req.session.username){
							flag = 1;
							res.render('rated.ejs',{_id:req.query._id,rate:false});
						}
					}
					if(flag == 0){
						grades.push({'user':req.session.username,'score':req.body.rate});
						var new_v = {};
						new_v['grades'] = grades;
						updateRestaurant(db,criteria,new_v,function(r){
							res.render('rated.ejs',{_id:req.query._id,rate:true});
						});
					}
				}
			});
	});
	
});

//api
app.get('/api/restaurant/:name/:data',function(req, res) {
	var name = req.params.name;
	var data = req.params.data;
	var criteria = {};
	criteria[req.params.name] = req.params.data;
    MongoClient.connect(mongourl, function(err, db) {
    	findRestaurants(db,criteria,0,function(r) {
    			if(r.length>0){
    				res.status(200).json(r).end();
    			}else{
    				res.status(200).json({}).end();
    			}
				
    	});
    });
});
app.post('/api/restaurant/',function(req, res) {
	var r = req.body;
	MongoClient.connect(mongourl, function(err, db) {
		insertRestaurant(db,r,function(result) {
			var r = JSON.parse(result);
			var rp = {};
			findRestaurants(db,{},1,function(restaurant) {
				
			if(r.ok == 1){
				var _id = restaurant[0]._id;
				rp['_id'] = ObjectId(_id);
				rp['status'] = "ok";
				
				
			}else{
				rp['status'] = "failed";
			}
		    res.status(200).json(rp).end();
				    
			});
		});
	});
});
function search(res,req) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err,fields,files) {
    	var new_r = {};	// document to be inserted
    	if (fields['id']) new_r['restaurant_id'] = fields['id'];
    	if(fields['owner']) new_r['owner'] = fields['owner'];
    	if (fields['name']) new_r['name'] = fields['name'];
    	if (fields['borough']) new_r['borough'] = fields['borough'];
    	if (fields['cuisine']) new_r['cuisine'] = fields['cuisine'];
    	if (fields['building'] || fields['street']) {
    		var address = {};
    		if (fields['building']) address['building'] = fields['building'];
    		if (fields['street']) address['street'] = fields['street'];
    		if (fields['zipcode']) address['zipcode'] = fields['zipcode'];
    		if(fields['lon'] && fields['lat']) address['coord'] = [fields['lon'],fields['lat']];
    		new_r['address'] = address;
    	}
        console.log(fields);
	    console.log('About to insert: ' + JSON.stringify(new_r));
	    
	    if (files.filetoupload.size != 0) {
                  var filename = files.filetoupload.path;
                  if (fields.title) {
                    var title = (fields.title.length > 0) ? fields.title : "untitled";
                  }
                  if (files.filetoupload.type) {
                    var mimetype = files.filetoupload.type;
                  }
                  fs.readFile(filename, function(err,data){
		                  new_r['photomimetype'] = mimetype;
		                  new_r['photo'] = new Buffer(data).toString('base64');
		                  read_n_print(res,req,new_r,-1);
                  });        
	    	
	    }else{
            read_n_print(res,req,new_r,-1);
        }

    });
}

function checkLogin(req,res,criteria) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		findUser(db,criteria,function(user) {
			db.close();
			console.log('Disconnected MongoDB\n');
			if(user[0]){
			    req.session.authenticated = true;
			    req.session.username = user[1];
			    console.log(req.session.username);
			    res.redirect('/');
			}else{
			    res.render("login.ejs",{wrong:true});
			}
			return user;
		}); 
	});
}

function findUser(db,criteria,callback) {
    var user = db.collection('user').find(criteria); 
    user.each(function(err, doc){
        assert.equal(err, null);
        if(doc != null){
            callback([true,doc.name]);
        }else{
            callback(false);
        }
    });
    
}

function create(res,req) {
    var form = new formidable.IncomingForm();
    form.parse(req, function(err,fields,files) {
    	var new_r = {};	// document to be inserted
    	if (fields['id']) new_r['restaurant_id'] = fields['id'];
    	new_r['owner'] = req.session.username;
    	if (fields['name']) new_r['name'] = fields['name'];
    	if (fields['borough']) new_r['borough'] = fields['borough'];
    	if (fields['cuisine']) new_r['cuisine'] = fields['cuisine'];
    	if (fields['building'] || fields['street']) {
    		var address = {};
    		if (fields['building']) address['building'] = fields['building'];
    		if (fields['street']) address['street'] = fields['street'];
    		if (fields['zipcode']) address['zipcode'] = fields['zipcode'];
    		if(fields['lon'] && fields['lat']) address['coord'] = [fields['lon'],fields['lat']];
    		new_r['address'] = address;
    	}
        console.log(fields);
	    console.log('About to insert: ' + JSON.stringify(new_r));
	    
	    if (files.filetoupload.size != 0) {
                  var filename = files.filetoupload.path;
                  if (fields.title) {
                    var title = (fields.title.length > 0) ? fields.title : "untitled";
                  }
                  if (files.filetoupload.type) {
                    var mimetype = files.filetoupload.type;
                  }
                  fs.readFile(filename, function(err,data){
                        MongoClient.connect(mongourl,function(err,db) {
                            try {
                                assert.equal(err,null);
                            } catch (err) {
                                res.writeHead(500,{"Content-Type":"text/plain"});
                                res.end("MongoClient connect() failed!");
                                return(-1);
                            }
                            new_r['photomimetype'] = mimetype;
                            new_r['photo'] = new Buffer(data).toString('base64');
                            insertRestaurant(db,new_r,function(result) {
                                db.close();
                                res.render('created.ejs');
                            })
                        });
                  });
        }else{
            MongoClient.connect(mongourl,function(err,db) {
    		    assert.equal(err,null);
        		console.log('Connected to MongoDB\n');
        		insertRestaurant(db,new_r,function(result) {
        			db.close();
        			console.log(JSON.stringify(result));
        			res.render('created.ejs');		
        		});
    	    });
        }

    });
}

function insertRestaurant(db,r,callback) {
	db.collection('restaurant').insertOne(r,function(err,result) {
		assert.equal(err,null);
		console.log("Insert was successful!");
		callback(result);
	});
}

function displayRestaurant(res,id) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		try{
		db.collection('restaurant').
			findOne({_id: ObjectId(id)},function(err,doc) {
				assert.equal(err,null);
				db.close();
				if(doc == null){
				      
				}
				console.log('Disconnected from MongoDB\n');
				//res.writeHead(200, {"Content-Type": "text/html"});
				console.log(doc);
				res.render("display.ejs",{
				    r:doc
				});
		});}catch(e){
		    res.writeHead(404, {"Content-Type": "text/plain"});
                      res.write("Do not have this restaurant\n");
                      res.end();
		}
	});
}

function read_n_print(res,req,criteria,max) {
	MongoClient.connect(mongourl, function(err, db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		findRestaurants(db,criteria,max,function(restaurants) {
			db.close();
			console.log('Disconnected MongoDB\n');
			if (restaurants.length == 0) {
				res.writeHead(500, {"Content-Type": "text/plain"});
				res.end('Not found!');
			} else {
				res.render('main',{
					user:req.session.username,
					restaurants:restaurants,
					docNo:restaurants.length,
					criteria:JSON.stringify(criteria)
				});
				/*
				res.writeHead(200, {"Content-Type": "text/html"});			
				res.write('<html><head><title>Restaurant</title></head>');
				res.write('<body><H1>Restaurants</H1>');
				res.write('<H2>Showing '+restaurants.length+' document(s)</H2>');
				res.write('<ol>');
				for (var i in restaurants) {
					res.write('<li><a href=/display?_id='+
					restaurants[i]._id+'>'+restaurants[i].name+
					'</a></li>');
				}
				res.write('</ol>');
				res.end('</body></html>');
				*/
				return(restaurants);
			}
		}); 
	});
}

function findRestaurants(db,criteria,max,callback) {
	var restaurants = [];
	if (max > 0) {
		cursor = db.collection('restaurant').find(criteria).limit(max); 		
	} else {
		cursor = db.collection('restaurant').find(criteria); 				
	}
	cursor.each(function(err, doc) {
		assert.equal(err, null); 
		if (doc != null) {
			restaurants.push(doc);
		} else {
			callback(restaurants); 
		}
	});
}


function remove(res,req,criteria) {
	console.log('About to delete ' + JSON.stringify(criteria));
	MongoClient.connect(mongourl,function(err,db) {
		assert.equal(err,null);
		console.log('Connected to MongoDB\n');
		findRestaurants(db,criteria,1,function(restaurant){
			var owner = restaurant[0].owner;
			if(owner == req.session.username){
				deleteRestaurant(db,criteria,function(result) {
					db.close();
					console.log(JSON.stringify(result));
					//res.writeHead(200, {"Content-Type": "text/plain"});
					//res.write("delete was successful!");
					res.render("remove.ejs",{remove:true});
					res.end();
				});
			}else{
				res.render("remove.ejs",{remove:false});
			}
		});
		
		
	});
}

function deleteRestaurant(db,criteria,callback) {
	db.collection('restaurant').deleteOne(criteria,function(err,result) {
		assert.equal(err,null);
		console.log("Delete was successfully");
		callback(result);
	});
}

function update(res,req) {
	
	var form = new formidable.IncomingForm();
	form.parse(req, function(err,fields,files) {
		var criteria = {};
		criteria['_id'] = ObjectId(fields['_id']);
		var new_r = {};	// document to be inserted
    	if (fields['id']) new_r['restaurant_id'] = fields['id'];
    	if (fields['name']) new_r['name'] = fields['name'];
    	if (fields['borough']) new_r['borough'] = fields['borough'];
    	if (fields['cuisine']) new_r['cuisine'] = fields['cuisine'];
    	if (fields['building'] || fields['street']) {
    		var address = {};
    		if (fields['building']) address['building'] = fields['building'];
    		if (fields['street']) address['street'] = fields['street'];
    		if (fields['zipcode']) address['zipcode'] = fields['zipcode'];
    		if(fields['lon'] && fields['lat']) address['coord'] = [fields['lon'],fields['lat']];
    		if(address.length > 0){
    			new_r['address'] = address;
    		}
    	}
    	if (files.filetoupload.size != 0) {
                  var filename = files.filetoupload.path;
                  if (fields.title) {
                    var title = (fields.title.length > 0) ? fields.title : "untitled";
                  }
                  if (files.filetoupload.type) {
                    var mimetype = files.filetoupload.type;
                  }
                  fs.readFile(filename, function(err,data){
                        MongoClient.connect(mongourl,function(err,db) {
                            try {
                                assert.equal(err,null);
                            } catch (err) {
                                res.writeHead(500,{"Content-Type":"text/plain"});
                                res.end("MongoClient connect() failed!");
                                return(-1);
                            }
                            new_r['photomimetype'] = mimetype;
                            new_r['photo'] = new Buffer(data).toString('base64');
                            updateRestaurant(db,criteria,new_r,function(result) {
								db.close();
								res.render('updated',{update:true});
							});
                        });
                  });
        }else{
            MongoClient.connect(mongourl,function(err,db) {
    		    assert.equal(err,null);
        		console.log('Connected to MongoDB\n');
        		updateRestaurant(db,criteria,new_r,function(result) {
					db.close();
					res.render('updated',{update:true});
				});
    	    });
        }
        
	});	
}

function updateRestaurant(db,criteria,newValues,callback) {
	db.collection('restaurant').updateOne(
		criteria,{$set: newValues},function(err,result) {
			assert.equal(err,null);
			console.log("update was successfully");
			callback(result);
	});
}

app.listen(app.listen(process.env.PORT || 8099));