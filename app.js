"use strict";

// https://mdn.github.io/dom-examples/service-worker/simple-service-worker/

// navigator.serviceWorker.ready.then((reg)=>console.warn('the service worker registration is now ready',reg));
//^this fires when you press install...

/* SERVICE WORKERS */
var service=null;

function isServiceSupported(){
	return 'serviceWorker' in navigator; 
}
function isServiceRunning(){
	return isServiceSupported() && navigator.serviceWorker.controller;
}
function inStandaloneMode(){
	return window.matchMedia('(display-mode: standalone)');
}
async function isServiceRegistered(){
	try{
		//service can still be running if it's just been unregistered
		// if(isServiceRunning()){
		// 	return true;
		// }else 
		if(!isServiceSupported()){
			return false;
		}else{
			let registration=await Promise.race([
				new Promise(res=>setTimeout(()=>res(false),100))
				,navigator.serviceWorker.getRegistration()
			])
			return registration && registration.active ? true : false
		}
	}catch(e){
		console.error(e);
		return false;
	}
}


/**
 * Check if service workers are supported and if one is currently active and ready to be used.
 * Also show the state next to the install button
 * 
 * NOTE: checks async if a service is registered but not running. will update dom but doesn't affect return value
 * 
 * @return boolean          True if a running service worker exists, else false
 * @sync
 */
function checkService(){
	let elem=document.querySelector('#install>.service .state');
	let button=document.querySelector('#install>.service .enable');
	if (!isServiceSupported()) {
		showState(elem,'cross',"serviceWorkers are not supported by your browser");
		button.disabled=true;
		return false;
	}else if(isServiceRunning()){
		showState(elem,'checkmark',"A serviceWorker is running in the background");
		button.disabled=true;
		return true;
	}else{
		//supported, but we don't know if it's been installed but inactive
		showState(elem,'nothing');
		isServiceRegistered().then(reg=>{
			if(reg){
				button.disabled=true;
				showState(elem,'checkmark',"A serviceWorker has been registered but it not yet running, reload browser to run");
			}else{
				button.disabled=false;
				console.log("serviceWorkers are supported, but you havn't installed one yet")
			}
		})
		return false;
	}
}



function Service(){
	//Will be set to true when you can send
	this.connected=false;
	var onconnect;
	this.connect=()=>{
		if(!isServiceRunning()){
			console.error("service worker not running");
			this.connected=false;
			return Promise.resolve(false);
		}else if(this.connected){
			console.warn("socket already connected to service");
			return Promise.resolve(true)
		}else{
			console.log("setting up MessageChannel to service...");
			//We can talk to the service worker using the .postMessage() method, but the service worker can't
			//respond unless we give him a means of doing so, enter MessageChannels.
			const channel = new MessageChannel();

			//The channel has 2 ports. 
			//We keep port1 and listen to it for responses messages from the service
			channel.port1.onmessage=receive;
			//We transfer ownership of port2 to the service which it can use to respond to us
			navigator.serviceWorker.controller.postMessage('REGISTER', [channel.port2]);

			return new Promise(res=>{onconnect=res});
		}
	}

	const pending={};
	var id=0;
	this.send=(method,payload,timeout)=>{
		if(!this.connected)
			return Promise.reject("not connected");

		try{
			let msgId=id++;
			let msg={method,msgId,payload};
			let resolve;
			let promise=new Promise((res)=>{resolve=res});
			pending[msgId]=resolve;
			navigator.serviceWorker.controller.postMessage(msg)
			return Promise.race([
				promise
				,sleep(timeout||10000).then(()=>Promise.reject('timeout'))
			]);
		}catch(e){
			return Promise.reject(e);
		}
	}
	this.backgroundNotification=(msg,delay)=>{
		this.send('showNotification',{msg,delay}).catch(console.error);
	}

	
	this.uninstall=async()=>{
		try{
			console.log('clearing background intervals...');
			await this.send('clearBackgroundIntervals');
			console.log('clearing cached content...');
			await this.send('clearCache');
		}catch(e){
			console.error("Failed to uninstall service",e);
		}

	}

	const receive=(event)=>{
		try{	
		  if(event.data.msgId){
		  	if(pending.hasOwnProperty(event.data.msgId)){
				pending[event.data.msgId](event.data.err,event.data.response);
		  	}else{
		  		console.warn("msgId="+event.data.msgId+" doesn't match any pending messages",pending,event.data.payload);
		  	}
		  }else if(event.data=='REGISTERED'){
		  	this.connected=true;
		  	if(typeof onconnect=='function')
		  		onconnect(true);
		  }else{
		  	console.warn('Unknown message from service:',event);
		  }
		}catch(e){
			console.error(e);
		}
	}

}


async function enableService(){
	try{
		let elem=document.querySelector('#install>.service .state');
		let button=document.querySelector('#install>.service .install');
		if (!isServiceSupported()) {
			showState(elem,'cross',"serviceWorkers are not supported by your browser");
			button.disabled=true;
		}else if(isServiceRunning()){
			showState(elem,'checkmark',"background service is already running");
			button.disabled=true;
		}else{
			var registration;
			if(await isServiceRegistered()){
				showState(elem,'info',"service worker already registered");
				registration=await navigator.serviceWorker.ready;
			}else{
				showState(elem,'info',"registering service worker...");
				registration=await navigator.serviceWorker.register('/serviceworker.js',{scope: '/'})
				await sleep(500);
			}

			registration.update(); //check server for new version
			checkService();
		}
	}catch(e){
		console.error(e);
	}
}

async function disableService(){
	try{
		if(await isServiceRegistered()){
			if(service && service.connected){
				await service.uninstall();
			}
			console.log('unregistering service worker...');
			let registration=await navigator.serviceWorker.getRegistration();
			await registration.unregister();
			await sleep(500);
			showState('#install>.service .state','info','You have to reload the browser to complete the uninstall')
		}else{
			console.log("no service worker registered");
		}

	}catch(e){
		console.error(e);
	}
}































/* INSTALL POPUP */

function showInstall(){
	checkService();
	checkNotifications();
	document.getElementById('overlay').classList.remove('hidden');
}
function hideInstall(overlay,evt){
	if(overlay==evt.target){
		document.getElementById('overlay').classList.add('hidden');
	}
}
function showState(elem,show,tooltip){
	try{
		if(show=='cross')
			console.warn(tooltip);
		else if(tooltip)
			console.log(tooltip);
		
		if(typeof elem=='string')
			elem=document.querySelector(elem) || document.getElementById(elem);
		
		if(!elem || !elem.classList){
			console.error("Not valid element:",elem,show,tooltip);
		}else{
			if(!elem.classList.contains('state')){
				let alt=elem.parentNode.querySelector('.state');
				if(alt)
					elem=alt
				else{
					console.error("Could not find .state elem from:",elem);
					return;
				}
			}
			elem.classList.remove('checkmark');
			elem.classList.remove('cross');
			elem.classList.remove('info');
			if(show && show!='nothing'){
				elem.classList.add(show);
			}
			elem.title=tooltip;
		}

	}catch(e){
		console.warn("Could not show state of something",e);
	}
}

window.addEventListener('appinstalled', checkHomescreen)

function checkHomescreen(evt){
	var elem=document.querySelector('#install>.homescreen .state');
	if(evt){
		console.log("appinstalled event fired. let's see if getInstalledRelatedApps also contains it...")
		showState(elem,'checkmark');
	}
	navigator.getInstalledRelatedApps().then(arr=>{
		if(evt){
			if(arr.length){
				console.log("navigator.getInstalledRelatedApps() lists the app")
			}else{
				console.warn("navigator.getInstalledRelatedApps() does NOT list the app!",evt);
			}
		}else{
			if(arr.length){
				console.log("App has been added to homescreen")
				showState(elem,'checkmark');
			}else{
				console.log("App has NOT been added to homescreen");
				showState(elem,'nothing');
			}
		}
	})
}






/* NOTIFICATIONS */

function checkNotifications(){
	var perm='unsupported';
	try{
		if(Notification){
			perm=Notification.permission;
		}
		let elem=document.querySelector('#install>.notification .state');
		switch(Notification.permission){
			case 'default':
				showState(elem,'nothing');
				return 'supported';
			case 'granted':
				showState(elem,'checkmark',"Notifications have been enabled");
				break;
			case 'denied':
				showState(elem,'cross','You have denied notifications from being shown');
				break;
			case 'unsupported':
				showState(elem,'cross','Notifications are not supported by your browser');
				break;
			default:
				showState(elem,'cross','unknown notification permission: '+Notification.permission);
				perm='unsupported';
		}
		let btn=document.querySelector('#install>.notification .enable');
		if(btn)
			btn.disabled=true;
	}catch(e){
		console.error(e);
	}
	return perm;
}

function enableNotifications(){
	if(checkNotifications()=='supported'){
		Notification.requestPermission(checkNotifications);
	}else{
		console.warn("Not enabling notifications");
	}
}




const notificationDefaults={
	badge:"/logo.svg"
	,icon:"/logo.svg"
	,title:'Paragast'
};
function prepareNotificationObj(a,b){
	var n=Object.assign({
		tag:Math.round(Math.random()*100000)
		,timestamp:Date.now()
	},notificationDefaults);

	if(typeof a=='string'){
		if(typeof b=='string'){
			n.title=a;
			n.body=b;
		}else{
			n.body=a
		}
	}else{
		Object.assign(n,msgOrObj);
	}
	n.body=n.body||n.msg||n.description||'Check Paragast app'
	return n;
}

function showNotification(){
	try{
		if(!Notification || Notification.permission!='granted'){
			console.warn("Not allowed to show notifications");
			showToast.apply(this,arguments);
		}else{
			let obj=prepareNotificationObj.apply(this,arguments)
			console.log("NOTIFY:",obj);
			new Notification(obj.title, obj);
		}
	}catch(e){
		console.error(e);
	} 	
}

function showToast(msgOrObj){
	let obj=prepareNotificationObj.apply(this,arguments)
	console.log("TOAST:",obj);
	let toast=document.getElementById('toast-template').content.cloneNode(true).children[0];
	toast.id='toast-'+toast.tag
	if(obj.title!=notificationDefaults.title)
		toast.querySelector('.toast-title').innerText=obj.title;
	toast.querySelector('.toast-body').innerText=obj.body;
	// toast.setAttribute('onclick',"expireToast(this)");
	document.getElementById("toasts").appendChild(toast);
	setTimeout(()=>expireToast(toast),5000);
}

async function expireToast(toast,fast){
	try{
		toast.classList.add('fade-out'+(fast?'-fast':''));
		await sleep(fast?200:1000);
	}catch(e){}
	try{
		toast.remove()
	}catch(e){}
}



function demoNotification(){
	if(service && service.connected){
		const elem=document.querySelector('#install>.notification .state');
		var i=5
		service.backgroundNotification('This notification was fired from the background service. It will fire even if '+
			"your browser isn't open! Try it!",i*1000);
		elem.innerText=i;
		const interval=setInterval(()=>{
			i--;
			if(i<1){
				elem.innerText="";
				clearTimeout(interval);
			}else{
				elem.innerText=i;
			}
		},1000)
	}else{
		showNotification('This notification sent from the foreground because you have not installed the'+
			' background service');
	}
}








function hardReload(){
	disableService().then(()=>{
		console.log("clearing cache and reloading page")
		location.reload(true)
	});
}

function sleep(ms){
	return new Promise(resolve=>{
		setTimeout(resolve,ms);
	})
}




async function initApp(){
	try{
		if(!isServiceRunning()){
			console.warn("Not running app because service is not running");
		}else if(!inStandaloneMode()){
			console.warn("Background service is running, but we're not in standalone context so not showing anything...");
		}else{
			console.warn("RUNNING APP")
			document.body.replaceChild(document.getElementById('app').content,document.getElementById('website'));
			
			//connect to service
			service=new Service();
			await service.connect();
			
			//Announce we're running in background
			showToast('Paragast is running in the background');
			

			await service.send('setupDatabase');

		}
	}catch(e){
		console.error(e);
	}
}














/* APP */

function getService(){
	if(service && service.connected){
		return service
	}else{
		throw new Error("Service not connected!");
	}
}

function toggleMenu(){
	document.getElementById('menu').classList.toggle('hidden');
	document.querySelector('nav .three-dots').classList.toggle('pressed');
}


function demoApp(){
	// showPopup('demo');
	let service=getService();
	showNotification("Demo in progress...");
	// service.send('notificationInterval',{msg:"Paragast notification demo",interval:360000})
	populateTable();
}


function populateTable(){
	let service=getService();
	console.log("Fetching headlines from service...");


}


function addRow(data){
	let tr=document.getElementById('row-template').content.cloneNode(true).children[0];
	tr.id="headline-"+data.id;
	for(let td of Array.from(tr.children)){
		td.innerText=data[td.classList[0]];
	}
	document.querySelector('#headlines tbody').appendChild(tr);
}