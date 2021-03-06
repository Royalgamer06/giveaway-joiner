'use strict';
const {app, nativeImage, shell, Menu, session, Tray, BrowserWindow, ipcMain, ipcRenderer} = require('electron');
const storage = require('electron-json-storage');
const fs = require('fs');
const Request = require('request-promise');
const devMode = app.getVersion() === '2.0.14';
let appLoaded = false;
let authWindow = null;
let mainWindow = null;
let Browser = null;
let _session = null;
let Config = null;
let Lang = null;
let tray = null;
let user = null;
app.disableHardwareAcceleration();
storage.setDataPath(process.execPath + 'data');
const isSecondInstance = app.makeSingleInstance((commandLine, workingDirectory) => {
if (mainWindow) {
if (mainWindow.isMinimized())
mainWindow.restore();
if( !mainWindow.isVisible() )
mainWindow.show();
mainWindow.focus();
}
});
if ( isSecondInstance ){
app.quit();
}
ipcMain.on('save-user', function(event, data) {
user = data;
global.user = data;
});
ipcMain.on('change-lang', function(event, data) {
Lang.change(data);
event.sender.send('change-lang', data);
});
app.on('window-all-closed', function() {
if (process.platform !== 'darwin') {
app.quit();
}
});
app.on('ready', function() {
Config = new ConfigClass();
Lang = new LanguageClass();
_session = session.fromPartition('persist:GiveawayJoiner');
_session.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.186 Safari/537.36');
authWindow = new BrowserWindow({
width: 280,
height: 340,
title: 'GiveawayJoiner',
icon: __dirname + '/icon.png',
show: false,
center: true,
resizable: false,
frame: false,
webPreferences: {
session: _session,
devTools: devMode
}
});
authWindow.setMenu(null);
mainWindow = new BrowserWindow({
width: 730,
height: 500,
title: 'GiveawayJoiner',
icon: __dirname + '/icon.png',
show: false,
center: true,
resizable: false,
frame: false,
webPreferences: {
session: _session,
devTools: devMode
}
});
mainWindow.setMenu(null);
if(devMode){
mainWindow.webContents.openDevTools();
}
Browser = new BrowserWindow({
parent: mainWindow,
icon: __dirname + '/icon.png',
title: 'GJ браузер',
width: 1024,
height: 600,
minWidth: 600,
minHeight: 500,
modal: true,
show: false,
center: true,
webPreferences: {
nodeIntegration: false,
session: _session,
devTools: false
}
});
Browser.loadURL('file://' + __dirname + '/blank.html');
Browser.setMenu(null);
Browser.on('close', (e) => {
e.preventDefault();
Browser.loadURL('file://' + __dirname + '/blank.html');
Browser.hide();
if(mainWindow.hidden)
authWindow.focus();
else
mainWindow.focus();
});
authWindow.on('close', function(e){
authWindow.removeAllListeners('close');
mainWindow.close();
});
mainWindow.on('close', function(e){
mainWindow.removeAllListeners('close');
authWindow.close();
});
authWindow.on('closed', function(e) {
authWindow = null;
});
mainWindow.on('closed', function(e) {
mainWindow = null;
});
tray = new Tray(nativeImage.createFromPath(__dirname + '/tray.png'));
const trayMenu = Menu.buildFromTemplate([
{ label: 'Выход', type: 'normal', role: 'quit' }
]);
tray.setToolTip("GiveawayJoiner");
tray.setContextMenu(trayMenu);
tray.on('click', () => {
if( user === null )
authWindow.isVisible() ? authWindow.hide() : authWindow.show();
else
mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
});
global.authWindow = authWindow;
global.mainWindow = mainWindow;
global.Browser = Browser;
global.storage = storage;
global.Config = Config;
global.Lang = Lang;
global.ipcMain = ipcMain;
global.TrayIcon = tray;
global.shell = shell;
global.Request = Request;
global.devMode = devMode;
});
function startApp(){
if( appLoaded )
return;
let afterLangs = function(){
authWindow.loadURL('file://' + __dirname + '/auth.html');
authWindow.on('ready-to-show', function() {
authWindow.show();
if( Config.get('start_minimized') )
authWindow.hide();
else
authWindow.focus();
});
};
Lang.loadLangs(afterLangs);
appLoaded = true;
}
class LanguageClass {
constructor(){
this.default = 'ru_RU';
this.languages = {};
this.langsCount = 0;
Request({uri: 'http://0.0.0.0/api/langs_new', json: true})
.then((data) => {
if(data.response !== false){
data = JSON.parse(data.response).langs;
let checked = 0;
for(let one in data){
let name = data[one].name;
let size = data[one].size;
let loadLang = () => {
Request( { uri: 'http://0.0.0.0/trans/' + name } )
.then(( lang ) => {
fs.writeFile(storage.getDataPath() + '/' + name, lang, (err) => { });
})
.finally(() => {
checked++;
if( checked === data.length || name.indexOf(Lang.current()) >= 0 )
startApp();
});
};
if( !fs.existsSync( storage.getDataPath() + '/' + name ) )
loadLang();
else{
fs.stat(storage.getDataPath() + '/' + name, (err, stats) => {
if( stats.size !== size )
loadLang();
else
checked++;
if( checked === data.length )
startApp();
});
}
}
}
else
startApp();
})
.catch(() => {
startApp();
console.log('catchLang Constructor');
});
}
loadLangs(callback){
let _this = this;
if( fs.existsSync(storage.getDataPath()) ){
let lng_to_load = [];
let dir = fs.readdirSync(storage.getDataPath());
for(let x = 0; x < dir.length; x++){
if( dir[x].indexOf('lang.') >= 0 ){
lng_to_load.push(dir[x].replace('.json', ''));
}
}
if( !lng_to_load.length )
return;
storage.getMany(lng_to_load, function(error, langs){
if(error) throw new Error(`Can't load selected translation`);
let lng;
for(lng in langs.lang){
_this.langsCount++;
}
if( langs.lang[Config.get('lang', _this.default)] === undefined ){
_this.default = lng;
Config.set('lang', _this.default);
}
_this.languages = langs.lang;
if(callback)
callback();
});
}
}
get(key){
let response = this.languages;
let splited = (Config.get('lang', this.default) + '.' + key).split('.');
for(let i = 0; i < splited.length; i++){
if( response[splited[i]] !== undefined ){
response = response[splited[i]];
}
else{
response = key;
break;
}
}
return response;
}
change(setLang){
Config.set('lang', setLang);
}
count(){
return this.langsCount;
}
current(){
return Config.get('lang', this.default);
}
list(){
return this.languages;
}
}
class ConfigClass {
constructor(){
let _this = this;
this.settings = {};
storage.get("configs", function(error, data){
if(error) throw error;
_this.settings = data;
_this.set('inits', ( _this.get('inits', 0) + 1) );
});
}
set(key, value){
this.settings[key] = value;
storage.set("configs", this.settings);
}
get(key, def_val){
if( this.settings[key] !== undefined )
return this.settings[key];
if( def_val !== undefined )
return def_val;
return false;
}
}
