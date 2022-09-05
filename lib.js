'use strict';
console.debug("loading lib.js...");
(function(global){

	const config={ //stored as 'paragast' on global vv
		waitForServiceWorkerBoot:false //if true we don't enable navigationPreload
		,cacheName:'paragast'
		,database:{
			name:'paragast'
			,version:1
			,stores:[
				{
					name:'last'
					,options:{keyPath:'type'}
				}
				,{
					name:'history'
					,options:{autoIncrement:true}
					// ,schema:[
					// 	{method:'createIndex',args:["timestamp", "timestamp", { unique: false }]}
					// ]
				}
				,{
					name:'headlines'
					,options:{keyPath:'hash'}
					,schema:[
						{method:'createIndex',args:["timestamp", "timestamp", { unique: false }]}
					]
				}

			]
		}
		// ,googleNewsQuery:"https://newsapi.org/v2/top-headlines?sources=techcrunch&apiKey="
		,googleNews:{
			query:"https://newsapi.org/v2/top-headlines?language=en&pageSize=10&apiKey="
			,apiKeys:[
				'40d9d72d5d1a4505bdbed7dc34fb6cd8'
				,'89609c10d38147cea486ab995487e98f'
				,'faa33dba60d44389acd5e4cf2dd93f9c'
				,'0ce6de3cbc7c4973b3676db69c522d5f'

			]
			,index:0
			,useLocal:'articles.json'
		}

		,periodicSync:{
			name:'get-headlines'
			,interval:1000*60*3 //every 3 minutes
		}
		,heartbeatInterval:1000*60*3 //every 3 minutes

		,pushService:{
        	userVisibleOnly: true,
        	// applicationServerKey: urlBase64ToUint8Array('XXXX')
		}
	};

	Object.assign(global,{
		paragast:config
		,typeCheck
		,logErrors
		,sleep
		,prepareNotificationObj
		,exposedPromise
		,listenOnce
		,copy
		,hash
		,formatDate
		,promify
		,Database
		,getLast
		,setLast
		,fetchHeadlines
		,storeHeadlines
		,checkNewHeadlines
		,prepareHeadlineNotification
		,sortHeadlines
		,logHistory
		,setupHeartbeat
	});



	function typeCheck(value,expectedType,argNr="?"){
		let gotType=typeof value;
		if(gotType!=expectedType){
			throw new TypeError(`Expected arg #${argNr} to be a ${expectedType}, got a ${gotType}: `+String(value));
		}

	}

	function logErrors(err,...extra){
		if(typeof err=='string'){
			err=new Error(err);
		}
		if(!err.cause){
			for(let i in extra){
				if(extra[i] instanceof Error){
					err.cause=extra.splice(i,1).pop();
					break;
				}
			}
		}
		var flat=[err]
		while(err.cause){
			flat.push(err.cause);
			console.group(" ");
			err=err.cause;
		}
		while(flat.length>1){
			console.error(flat.pop())
			console.groupEnd();
		}
		console.error(flat.pop(),...extra);
	}


	function sleep(ms){
		return new Promise(resolve=>{
			setTimeout(resolve,ms);
		})
	}

	function prepareNotificationObj(a,b){
		var n={
			icon:"/icons/icon-square-144.png"
			,badge:"/icons/icon-square-96.png" //do we want this? onesignal is not using but did they have android notification icon?
			,tag:Math.round(Math.random()*100000)
			,timestamp:Date.now()
			,requireInteraction: true //means you have to click it
			,renotify: true //seems like this triggers sound and vibration on mobile... even though there's a 'vibrate' param
		};

		if(typeof a=='string'){
			if(typeof b=='string'){
				n.title=a;
				n.body=b;
			}else{
				n.body=a
				if(b && typeof b=='object'){
					Object.assign(n,b);		
				}
			}
		}else if(a && typeof a=='object'){
			Object.assign(n,a);
		}
		n.body=n.body||n.msg||n.description||n.content
		if(!n.body && n.title){
			n.body=n.title
			n.title='Paragast'
		}
		return n;
	}
/*
actions: undefined
badge: undefined
body: "asdfasdf"
data:{
	content: "asdfasdf"
	data: {}
	heading: "asdfasdf"
	icon: "https://img.onesignal.com/permanent/c2112136-ba7f-4254-88a1-ff54b7264606"
	id: "d4f77105-3029-4b2a-bdab-b7b7852ffeac"
}
icon: "https://img.onesignal.com/permanent/c2112136-ba7f-4254-88a1-ff54b7264606"
image: undefined
renotify: true
requireInteraction: true
tag: "d5abed7b-6cb5-4b40-99d5-2c503ec49996"
vibrate: undefined
*/

	function exposedPromise(timeout){
		var resolve,reject;
		var promise=new Promise((res,rej)=>{resolve=res;reject=rej;});
		promise.state='pending';
		promise.resolve=(data)=>{promise.state='resolved';promise.result=data;resolve(data)};
		promise.reject=(err)=>{promise.state='rejected';promise.result=err;reject(err);};
		promise.callback=(err,data)=>{
			if(err){
				promise.reject(err);
			}else{
				promise.resolve(data);
			}
		}
		if(timeout){
			setTimeout(()=>promise.reject('timeout'),timeout)
		}
		
		return promise;
	}


	function listenOnce(target,evtName,timeout){
		let p=exposedPromise();
		target.addEventListener(evtName, p.resolve);
		let fired=false;
		p.then(event=>{
			fired=true;
			target.removeEventListener(evtName,p.resolve);
			return event;
		})
		if(timeout){
			setTimeout(()=>{
				if(!fired){
					fired=true;
					target.removeEventListener(evtName,p.resolve);
					p.reject('timeout');
				}
			})
		}
		return p;
	}

	function copy(obj){
		return JSON.parse(JSON.stringify(obj));
	}

	function hash(str,seed=0){
	    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
	    for (let i = 0, ch; i < str.length; i++) {
	        ch = str.charCodeAt(i);
	        h1 = Math.imul(h1 ^ ch, 2654435761);
	        h2 = Math.imul(h2 ^ ch, 1597334677);
	    }
	    h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
	    h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
	    return 4294967296 * (2097151 & h2) + (h1>>>0);
	}

	function formatDate(format,date){
		if(format instanceof Date || isNaN(String(format).substr(0,1))==false){
			let f=date
			date=format
			format=date;
		}
		typeCheck(format,'string',1);
		date=(date instanceof Date ? date : new Date(date));
		switch(format.toLowerCase()){
			case 'object':
				return date;
			case 'unix':
			case 'unixtime':
			case 'number':
				return Math.floor(date);
			case 'time':
			case 'timeonly':
				return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
			case 'date':
			case 'ymd':
			case 'y-m-d':
				let year=String(date.getUTCFullYear());
				let month=String(date.getUTCMonth()+1).padStart(2,'0');
				let day=String(date.getUTCDate()).padStart(2,'0');
				return `${year}-${month}-${day}`;
			case 'timestamp':
			case 'z':
			case 'datetime':
			case 'y-m-dth:i:sz':
			case 'string':
				let hours=String(date.getUTCHours()).padStart(2,'0');
				let minutes=String(date.getUTCMinutes()).padStart(2,'0');
				let seconds=String(date.getUTCSeconds()).padStart(2,'0');
				let time=`T${hours}:${minutes}:${seconds}Z`
				return formatDate('date',date)+time;
			default:
				throw new Error("Not a valid format: "+format);
		}
	}







	function Database(config){
		this.config=config;
		this.db=null;
	}


	Database.prototype.setup=function(){
		try{
			var promise=exposedPromise(3000);

			if(this.db){
				if(this.checkStructure()){
					console.log("Database already setup and contains the right stores");
					promise.resolve(this);
				}else{
					promise.reject("Database is NOT in correct state");
				}
			}else{

				console.log(`Creating IDBDatabase '${this.config.name}' v${this.config.version}`);
				var request = indexedDB.open(this.config.name,this.config.version);
				
				request.onblocked=(event)=>{
					console.error('indexedDB.open.onblocked',event)
					promise.reject(event.target.error);
				};
				request.onerror=(event)=>{
					console.error('indexedDB.open.onerror',event)
					promise.reject(event.target.error);
				};

				
				//If the specified version of the database doesn't exist the onupgradeneeded event will be fired. 
				//that event is fired while request.transaction is still in "mode=versionchange", ie. the mode 
				//required to change stores (remember how transactions can be in modes readonly,readwrite,versionchange)
				request.onupgradeneeded=(event)=>{
					try{
						let db=event.target.result;
						let transaction=request.transaction
						console.log("indexedDB.open.onupgradeneeded",{event,db,transaction}); 
						transaction.oncomplete=()=>{console.log("'versionchange' transaction completed",transaction)}
						transaction.onerror=(err)=>{logErrors("'versionchange' transaction failed",err)}
						createAllObjectStores( db, this.config.stores );
					}catch(cause){
						promise.reject(new Error("Failed during 'onupgradeneeded' event.",{cause}))
					}
				};


				request.onsuccess=(event)=>{
					console.log("indexedDB.open.onsuccess",event);
					//Since onupgradeneeded may not have fired because the db already existed we have to check to make
					//sure that it contains the tables we want
					this.db=event.target.result;
					if(this.checkStructure()){ //will log and reject promise if we're not setup right
						console.log('Database open and verified to have correct stores');
						promise.resolve(this);
					}else{
						promise.reject("Database open, but it doesn't contain the correct stores")
					}
					
				}
			}
		}catch(e){
			promise.reject(e);
		}

		return promise.catch(err=>{
			console.warn('indexedDB.open() request:',request);
			this.close();
			return Promise.reject(err);
		});
	}

	/**
	* Create all the IDBObjectStores we want on a IDBDatabase. 
	*
	* @param <IDBDatabase>     db
	* @param object            confs
	* 
	* 
	* @return object {name1:IDBObjectStores1, name2:IDBObjectStores...}) 
	*/
	function createAllObjectStores(db,confs){
		console.log("Creating "+confs.length+" IDBObjectStores...");
		var stores={};
		for(let s of confs){
			try{
				console.log(`Creating IDBObjectStore '${s.name}'`,s.options,s.schema);
				let store=db.createObjectStore(s.name, s.options);
				if(s.schema){
					for(let rule of s.schema){
						store[rule.method].apply(store,rule.args)
					}
				}
				stores[s.name]=store;
			}catch(cause){
				logErrors(new Error(`Failed to create '${s.name}' IDBObjectStore`,{cause}));
			}
		}
		return stores;
	}


	Database.prototype.checkStructure=function(){
		let details={
			created:Object.values(this.db.objectStoreNames)
			,configured:this.config.stores
		};
		if(!details.created.length){
			console.error("None of the IDBObjectStores were created",details);

		}else if(details.created.length != details.configured.length){
			console.error("Not ALL of the IDBObjectStores were created",details);

		}else{
			//TODO: add check of internal structure
			return true;
		}
		return false;
	}


	Database.prototype.close=function(){
		if(this.db){
			console.log("Closing database...")
			this.db.close();
		}			
		this.db=null;
	}

	Database.prototype.destroy=async function(){
		this.close();
		console.log("Deleting database...")
		var promise=exposedPromise();
		var req=indexedDB.deleteDatabase(this.config.name);
		req.onsuccess=()=>{
			console.warn("Deleted IndexedDB");
			promise.resolve(true);
		}
		req.onerror=promise.reject;
		req.onblocked=promise.reject;
		
		return promise.catch(evt=>{
			logErrors("Failed to delete database: "+evt.type,evt);
			promise.resolve(false);
		})
	}

	Database.prototype.hasStore=function(store){
		return Object.keys(this.db.objectStoreNames).indexOf(store)>-1
	}

	
	/**
	 * Add a promise to an object which resolves/rejects when certain
	 * callbacks on the object are called, eg. onerror
	 * 
	 * @param object   obj
	 * @param array    resolveProps
	 * @param array    rejectProps
	 * @param number   timeout
	 * 
	 * @return <Promise>
	 */
	function promify(obj,resolveProps,rejectProps,timeout=0){
		var promise=exposedPromise(timeout);
		resolveProps=resolveProps||['oncomplete','onsuccess'];
		for(let prop of resolveProps){
			obj[prop]=(event)=>promise.resolve(event.target.result);
		}
		rejectProps=rejectProps||['onerror','onabort'];
		for(let prop of rejectProps){
			obj[prop]=(event)=>promise.reject(event.target.error);
		}
		Object.defineProperty(obj,'promise',{value:promise, configurable:true})
		return promise;
	}
	/**
	 * Start a transaction on the database, then open all requested ObjectStores and connect a promise
	 * to the oncomplete and onerror callbacks
	 * 
	 * @param array|string stores    One or more stores which will be part of the transaction
	 * @param string *mode           In what mode should the stores be accessed? Default 'readwrite'
	 * 
	 * @return <IDBTransaction>      ...with additional props .promise .stores, .operations and .exec
	 */
	Database.prototype.begin=function(stores,readwrite){
		stores=Array.isArray(stores) ? stores : [stores];
		const mode=readwrite ? 'readwrite' : 'readonly';
		if(!this.db){
			this.setup().catch(console.error);
			throw new Error("Database not setup (attempting to do so in background)");
		}
		const transaction=this.db.transaction(stores,mode);
		promify(transaction,['oncomplete'],['onerror','onabort']);
		Object.defineProperty(transaction,'stores',{value:{}});
		for(let s of stores){
			transaction.stores[s]=transaction.objectStore(s);
		}
		Object.defineProperty(transaction,'operations',{value:[]});
		Object.defineProperty(transaction,'exec',{value:
			(store,method,...args)=>{
				if(stores.length==1 && stores.indexOf(store)==-1){
					args.unshift(method);
					method=store;
					store=stores[0];
				}
				const s=transaction.stores[store];
				try{
					var request=s[method].apply(s,args);
				}catch(e){
					//all (?) methods use the onerror/onsuccess events, but errors can also be thrown.. .maybe...
					//they're listed here: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put#exceptions
					throw new Error(e.message+" "+JSON.stringify({store,args}));
				}

				promify(request,['onsuccess'],['onerror']);
				let operation={store,method,args,request};
				transaction.operations.push(operation);
				console.debug("Performed operation in transaction:",{transaction,operation})
				return request.promise
				//NOTE: a single exec can throw and fail without the entire transaction being affected... i think
			}
		});
		return transaction;
	}



	/**
	 * Add an array of records to the database
	 * 
	 * @param string store
	 * @param array  records  
	 * 
	 * @throws If we couldn't access store or if any records aren't able to be added
	 * @return 
	 * @async
	 * */
	Database.prototype.addAll=async function(store,records){
		var transaction=this.begin(store,true); //true=>will write
		for(let record of records){
			transaction.exec('add',record)
		}
		transaction.commit();
		return transaction.promise.catch(event=>{
			console.error("Database.addAll() failed:",{event,transaction});
			return Promise.reject("Failed to add all records.");
		})
	}

	/**
	 * Write a value to the database, NOT overwriting something else
	 * 
	 * @param string store
	 * @param string value
	 * @param string *key
	 * 
	 * @throws If we couldn't access store or if a record with that key already exists
	 * @return ?  
	 * @async
	 */
	Database.prototype.add=async function(store,...valuekey){
		return promify(this.begin(store,true).stores[store].add(...valuekey));
	}

	/**
	 * Write a value to the database, possibly overwriting something else
	 * 
	 * @param string store
	 * @param string value
	 * @param string *key
	 * 
	 * @throws
	 * @return ? 
	 * @async
	 */
	Database.prototype.put=async function(store,...valuekey){
		return promify(this.begin(store,true).stores[store].put(...valuekey));
	}


	/**
	 * Get all values from a store
	 * 
	 * @param string store
	 * 
	 * @throws If we couldn't access store
	 * @return array
	 * @async
	 */
	Database.prototype.getAll=async function(store){
		return this.begin(store).exec('getAll');
	}


	/**
	 * Check if a primary key or indexed key exists
	 * 
	 * @param string store
	 * @param string *index    Optionally passed in the middle
	 * @param string key
	 * 
	 * @throws If we couldn't access store/index
	 * @return bool
	 * @async
	 */
	Database.prototype.has=async function(...args){
		const store=args.shift();
		const key=args.pop();
		const index=args.pop();
		return this.getKeys(store,index).then(keys=>keys.contains(key));
	}
	
	/**
	 * Get all primary or indexed keys
	 * 
	 * @param string store
	 * @param string *index    
	 * 
	 * @throws If we couldn't access store/index
	 * @return array   
	 * @async
	 */
	Database.prototype.getKeys=async function(store,index){
		var target=this.begin(store).stores[store];
		if(index){
			target=target.index(index)
		}
		return promify(target.getAllKeys())//.then(event=>event.target.result);
	}

	/**
	 * Get a value from the database
	 * 
	 * @param string store
	 * @param string *index    Optionally passed in the middle
	 * @param string key
	 * 
	 * @throws if we can't access store/index
	 * @return any|undefined							 
	 * @async
	 */
	Database.prototype.get=async function(...args){
		const store=args.shift();
		var target=this.begin(store).stores[store];
		const key=args.pop();
		const index=args.pop();
		if(index){
			target=target.index(index)
		}
		return promify(target.get(key))//.then(event=>event.target.result); 
	}

	




	async function getLast(type,format='string',increment=0){
		// console.log(global)
		const obj=await global.db.get('last',type);

		if(!obj){
			if(!global.db.hasStore(type)){
				console.warn(`No last '${type}' entry saved. Are you sure you spelled that correctly?`);
			}
			return null;
		}
		var last=obj.timestamp; //string

		increment=Number(increment);
		if(increment){
			last=Date.parse(last)+(increment*1000);
		}
		return formatDate(format,last);
	}

	async function setLast(type,timestamp){
		try{
			timestamp=formatDate('string',timestamp);
			await global.db.put('last',{timestamp,type});
			logHistory('set_last',type+" to "+timestamp);
			return timestamp
		}catch(e){
			logErrors("Failed to set last",arguments,e);
		}
	}


	

	async function fetchHeadlines(extraQueryParams=""){
		try{
			if(config.googleNews.useLocal){
				console.debug("Fetching local headlines");
				var response=await fetch(config.googleNews.useLocal);
			}else{
				typeCheck(extraQueryParams,'string',1);
				var google=config.googleNews;
				var key=google.apiKeys[google.index++ % google.apiKeys.length]
				var url=google.query+key+extraQueryParams;
				console.debug("Fetching headlines:",{url,google,extraQueryParams});
				var response=await fetch(url);
			}
			var payload=await response.json();
			if(payload.status=='error'){
				if(payload.code=='rateLimited')
					return fetchHeadlines(extraQueryParams);
				else
					throw new Error(payload.code+': '+payload.message);
			}
			var headlines=payload.articles;
			for(let headline of headlines){
				if(!headline.author && headline.source)
					headline.author=headline.source.name;
				delete headline.source;
				delete headline.content; //entire article
				headline.timestamp=formatDate('number',headline.publishedAt)
				headline.fetchedAt=formatDate('string',new Date());
				headline.hash=hash(headline.publishedAt+headline.title.substr(0,10));
			}
			return headlines.sort(sortHeadlines);
		}catch(cause){

			throw new Error("Failed to fetch headlines from "+url,{cause});
		}
	}

	async function storeHeadlines(newHeadlines,prevLast=0){
		try{
			console.log("Storing new headlines...",newHeadlines);
			const transaction=global.db.begin(['headlines','last'],true); //true => readwrite
			var last=prevLast=formatDate('number',prevLast);
			for(let headline of newHeadlines){
				//Update the latest timestamp...
				last=Math.max(last,headline.timestamp);
				//Store the headline
				transaction.exec('headlines','add',headline);
	//TODO: probably better to store one at a time so they don't all fail
			}
			if(last!=prevLast){
				transaction.exec('last','put',{timestamp:formatDate('string',last),type:'headlines'});
			}
			transaction.commit();
			await transaction.promise;
		}catch(cause){
			throw new Error("Failed to store new headlines",{cause});
		}
	}


	/**
	 * Check for new headlines
	 * 
	 * @param integer limit   For demo purposes, stop after having found this many
	 * 
	 * @return Integer        How many new headlines were found (subject to limit)
	 * */
	async function checkNewHeadlines(limit){
		try{
			logHistory('checking_headlines')
			if(!global.db)
				throw new Error("Cannot check for new headlines without anywhere to store them")
			let last=await getLast('headlines','string','+1');
			var query="";
			if(last){
				console.log("Checking for headlines newer than "+last);
				query="&from="+last;
			}else{
				console.warn("No headlines already in the database, just fetching anything")
			}
			let newHeadlines=await fetchHeadlines(query);

			//We shouldn't have gotten any old headlines, but just in case we check
			if(last){
				last=formatDate('number',last);
				newHeadlines=newHeadlines.filter(headline=>headline.timestamp>last);
			}
			if(limit && newHeadlines.length>limit){
				console.log("for demo purposes we're limiting from "+newHeadlines.length+" to "+limit+" new headlines");
				newHeadlines=newHeadlines.slice(-1*limit);
			}

			if(newHeadlines.length){
				await storeHeadlines(newHeadlines);
				console.log('NEW HEADLINES',newHeadlines);
				self.notify(prepareHeadlineNotification(newHeadlines));
				self.broadcast('headlines',newHeadlines);
			}else{
				console.debug("No new headlines found");
			}
			//Regarless if we found anything, store and broadcast the last checked timestamp
			setLast('checked_headlines',Date.now()).then(ts=>self.broadcast('checked_headlines',ts));
			return newHeadlines.length;
		}catch(e){
			logErrors("Problem checking for new headlines",e);
		}
	}

	function prepareHeadlineNotification(newHeadlines){
		var note={}
		if(newHeadlines.length===1){
			let headline=newHeadlines[0];
			note.title=headline.title;
			note.body=headline.description
			if(note.body.length>50)
				note.body=note.body.substring(0,50)+'...';
		}else{
			note.title="Found "+newHeadlines.length+" new headlines";
			note.body=newHeadlines.map(headline=>" - "+headline.title).join('\n');
		}
		return note;
	}

	function sortHeadlines(a,b){
		if(a.timestamp>b.timestamp){
			return -1;
		}else if(b.timestamp>a.timestamp){
			return 1;
		}else{
			return 0;
		}
	}



	function logHistory(type,details){
		try{
			let record={
				timestamp:formatDate('string',new Date())
				,type
				,details
			}
			if(global.db&&global.db.db){
				global.db.add('history',record).catch(console.error);
			}else{
				console.warn('history:',record);
			}
		}catch(e){
			console.error(e);
		}
	}

	function setupHeartbeat(from){
		if(!global.heartbeat || (Date.now()-global.heartbeat)>config.heartbeatInterval){
			global.heartbeat=Date.now(); //to avoid dubbel setup
			logHistory("heartbeat_setup",from);
			setInterval(()=>{
				global.heartbeat=Date.now();
				logHistory('heartbeat',from);
			},config.heartbeatInterval)
		}else{
			logHistory('heartbeat_found',from);
		}
	}

})(self);