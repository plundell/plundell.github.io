'use strict';
console.debug("loading lib.js...");
(function(global){

	Object.assign(global,{
		logErrors
		,sleep
		,prepareNotificationObj
		,exposedPromise
		,listenOnce
		,copy
	});


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
			badge:"/logo.svg"
			,icon:"/logo.svg"
			,tag:Math.round(Math.random()*100000)
			,timestamp:Date.now()
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
		n.body=n.body||n.msg||n.description||'Check Paragast app'
		return n;
	}

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

})(self);