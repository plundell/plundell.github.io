#Notification test

Trying to get a SPA to run as a native app providing desktop notifications. This involves 2 steps:
1. *Service Workers* - these essentially run in the background, cache content and serves it back up
2. *Notification API* - These produce popup notification

## Run
To run a local webserver we use npm/node module 'http-server'

```
$ npm install --global http-server
$ cd <this dir>
$ http-server
```
