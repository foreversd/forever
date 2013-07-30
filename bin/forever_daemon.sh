#!/bin/bash
#
# Copyright 2013 stefano.cudini@gmail.com
# http://labs.easyblog.it
#
# Nodejs Forever Demonizer with a low privilege user 
# official code: https://gist.github.com/stefanocudini/6116527
# tested on Debian Squeeze
#
# inspired by:
# https://www.exratione.com/2013/02/nodejs-and-forever-as-a-service-simple-upstart-and-init-scripts-for-ubuntu/
#
# requirements:
# https://github.com/nodejitsu/forever
#
### BEGIN INIT INFO
# Provides:             forever_daemon
# Required-Start:       $syslog $remote_fs
# Required-Stop:        $syslog $remote_fs
# Should-Start:         $local_fs
# Should-Stop:          $local_fs
# Default-Start:        2 3 4 5
# Default-Stop:         0 1 6
# Short-Description:    Forever Demonizer with a low privilege user 
# Description:          Forever Demonizer with a low privilege user 
### END INIT INFO
#
. /lib/lsb/init-functions

NODE_BIN_DIR=/opt/node/bin
NODE_PATH=/opt/node/lib/node_modules
PATH=$NODE_BIN_DIR:$PATH
export NODE_PATH=$NODE_PATH

APPDIR=/opt/app_dir
APPFILE=app.js
CONF=$APPDIR/conf.json

DAEMON_USER=app_user
DAEMON_NAME=forever_daemon

FOREVER_PIDFILE=/var/run/$DAEMON_NAME.pid
LOGERR=/var/log/$DAEMON_NAME/app.err
LOGOUT=/dev/null

DAEMON_PID=/var/run/$DAEMON_NAME.pid
DAEMON_LOG=/dev/null
DAEMON_BIN=$(readlink -f $NODE_BIN_DIR/forever)
DAEMON_OPTS="--pidFile $FOREVER_PIDFILE --sourceDir $APPDIR -a -l $DAEMON_LOG -e $LOGERR -o $LOGOUT --minUptime 5000 --spinSleepTime 2000 start $APPFILE $CONF" 

FOREVER_DIR=$(bash <<< "echo ~$DAEMON_USER")"/.forever"

if [ ! -d "$FOREVER_DIR" ]; then
    mkdir -p $FOREVER_DIR
    chown $DAEMON_USER:$DAEMON_USER $FOREVER_DIR
    chmod 0750 $FOREVER_DIR
fi

if [ ! -d "/var/log/$DAEMON_NAME" ]; then
    mkdir -p "/var/log/$DAEMON_NAME"
    chown $DAEMON_USER:$DAEMON_USER "/var/log/$DAEMON_NAME"
    chmod 0750 "/var/log/$DAEMON_NAME"
fi

start() {
	echo "Starting $DAEMON_NAME as user: $DAEMON_USER"
 
    start-stop-daemon --start --pidfile $DAEMON_PID \
        --make-pidfile --chuid $DAEMON_USER \
        --exec $DAEMON_BIN -- $DAEMON_OPTS
    RETVAL=$?
}

stop() {
    if [ -f $PIDFILE ]; then
		echo "Shutting down $DAEMON_NAME"
		# Get rid of the pidfile, since Forever won't do that.

		start-stop-daemon --stop --pidfile $DAEMON_PID \
				    --retry 300 \
				    --user $DAEMON_USER \
                    --exec $DAEMON_BIN -- "stop $APPFILE"
        
        rm -f $FOREVER_PIDFILE

        RETVAL=$?
    else
		echo "$DAEMON_NAME is not running."
		RETVAL=0
    fi
}

restart() {
    echo "Restarting $DAEMON_NAME"
    stop
    start
}

status() {
    echo "Status for $DAEMON_NAME:"
    forever list
    RETVAL=$?
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    status)
        status
        ;;
    restart)
        restart
        ;;
    *)
        echo "Usage: {start|stop|status|restart}"
        exit 1
        ;;
esac
exit $RETVAL
