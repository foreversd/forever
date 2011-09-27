module.exports = ForeverServiceAdapter;

function ForeverServiceAdapter(service) {
    this.service = service;
}
//
// This should install assets to appropriate places for initialization,
//   configuration, and storage
//
// The script will be used on startup to load ForeverService
//
// ForeverService should listen on something that the management events
//   can respond to in full duplex
//
// The installed adapter should send the following events in dnode protocol
//   to the ForeverService and invoke methods as appropriate
//
ForeverServiceAdapter.prototype.install = function install() {
    throw new Error('not implemented');
}
//
// This should do a rollback of install completely except for logs
//
ForeverServiceAdapter.prototype.uninstall = function uninstall() {
    throw new Error('not implemented');
}
//
// This should call back with an array of [{file:...,options:...},] to pass to Monitors
//   this will be invoked when foreverd is created (not started)
//
ForeverServiceAdapter.prototype.load = function load(callback) {
    throw new Error('not implemented');
}
//
// This should tell the OS to start the service
// this will not start any applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.start = function start(monitors) {
    throw new Error('not implemented');
}
//
// This should tell the OS to start the service
// this will not stop any applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.stop = function stop(monitors) {
    throw new Error('not implemented');
}
//
// This should tell the OS to reply with info about applications in the service
// this will not change any applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.status = function status(monitors) {
    throw new Error('not implemented');
}
//
// This should tell the OS to restart the service
// this will not restart any applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.restart = function restart(monitors) {
    throw new Error('not implemented');
}
//
// This should tell the OS to pause the service
// this will prevent any addition or removal of applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.pause = function pause(monitors) {
    throw new Error('not implemented');
}
//
// This should tell the OS to resume the service
// this will enable any addition or removal of applications
// make sure the adapter is installed and sending events to foreverd's listener
//
ForeverServiceAdapter.prototype.resume = function resume(monitors) {
    throw new Error('not implemented');
}