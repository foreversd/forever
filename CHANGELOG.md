## CHANGELOG

### Version 0.4.0 

- Enable forever to track uptime                     (indexzero)
- Add `restart` command to forever.Monitor and CLI   (indexzero)
- Ensure forever.load() is called on require()       (indexzero)
- Better handling for for `-p` CLI option            (indexzero)
- Enable options to be passed to child_process.spawn (indexzero) 

### Version 0.3.1

- Allow forever to start any script (not just node) from nodejs code  (substack)
- Array shortcut to set command and options                           (substack)
- Check for scripts with fs.stat before running them                  (indexzero)
- Improved how *.fvr and *.pid files are managed by Forever CLI       (indexzero)
- Ability to delete all historical logs from CLI via 'cleanlogs'      (indexzero)
- Ability to stop script by name -- stops ALL scripts with that name. (indexzero)
- Display logfile in 'forever list'.                                  (indexzero)
- Use process.kill() instead of exec('kill').                         (indexzero)
- Emit 'save' event when persisting to disk.                          (indexzero)
- Emit 'start' event when starting a forever child                    (indexzero)
- Remove 'auto-save' feature from Forever.start()                     (indexzero)

#### Breaking Changes

- Push options hierarchy up one level. e.g. Forever.options.silent is now Forever.silent (indexzero)
- Only 'error' event now emits with an error. All other events simply emit data          (indexzero) 