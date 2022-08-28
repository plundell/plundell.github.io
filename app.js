"use strict";

// https://mdn.github.io/dom-examples/service-worker/simple-service-worker/

function log(msg,e){
	if(e){
		if(e instanceof Error){
			console.warn(msg);
			console.error(e);
		}else{
			console.log(msg,e);
		}
	}else{
		console.log(msg);
	}
	let target=document.getElementById('log');
	if(target){
		let div=document.createElement('div');
		div.innerText=msg;
		target.appendChild(div);
	}else{
		console.warn("DOM not ready yet")
	}
}


function notify(msg){
	try{
		log(msg);
		let options={icon:"/favicon.ico"};
		if ('serviceWorker' in navigator){
			options.tag='backgroundNotification';
			navigator.serviceWorker.ready.then(registration=>registration.showNotification(msg,options))
		}else{
			options.tag='foregroundNotification';
			new Notification(msg, options);
		}
	}catch(e){
		console.error(e);
	} 
	
}



function unregisterClearAndReload(){
	log('unregistering service worker, clearing cache and reloading page...');
	navigator.serviceWorker.ready
		.then(registration=>registration.unregister())
		.then(()=>location.reload(true))
}

function sendFiveNotices(){
	notify("Notifying 5 times...");
	var i=5
	while(i){
		let msg='Hello world! '+i;
		i--;
		let delay=i*1000;
		// console.log(msg,delay);
		setTimeout(()=>notify(msg),delay);
	}
}



function enableNotifications(){
	if(Notification.permission==='denied'){
		log("Notifications have already been denied");
	}else{
		log("Enabling notifications...");
		Notification.requestPermission(status=>{
			log("Accept notifications? "+status);
		})
	}
}

function installApp(){
	
}

function initNotifications(){

	log("initializing notifications...");
	try{
		if(Notification){
			// log("Notifications ARE supported");
			if(Notification.permission==='granted'){
				log("Notifications already granted");
				blockButton();
			}else if(Notification.permission==='denied'){
				log("Notifications ARE supported but have already been denied");
				console.log(Notification);
			}
		}else{
			blockButton();
			log("Notifications are NOT supported");
		}

	}catch(e){
		log(e.message);
		blockButton();
	}
}

function blockButton(){
	document.getElementById('grant').disabled=true;
}	
	 



async function registerServiceWorker(){
	try{
		// log("initializing service worker...");

		if (!'serviceWorker' in navigator) {
			throw new Error("serviceWorker not supported");
		}else{
			// log("service workers are supported")
		}

		let registration=await navigator.serviceWorker.register('/serviceworker.js',{scope: '/'})
		
		if (registration.installing) {
			log("Service worker being installed on this load...");
		} else if (registration.waiting) {
			log("Service worker is 'installed'... unsure what that means...",registration)
		} else if (registration.active) {
			log("Previous service worker found and is already running")
		}

	}catch(e){
		log("Failed to register service worker",e);
	}
	return;
}


function showPopup(){
	document.getElementById('overlay').classList.remove('hidden');
}
function hidePopup(elem,evt){
	if(elem==evt.target){
		document.getElementById('overlay').classList.add('hidden');
	}
}


function init(){
	log("Running app.js..."+(new Date()).toUTCString())
	// registerServiceWorker();
	// initNotifications();
	console.log('app.js init() ran to end',self,document,window);
}

