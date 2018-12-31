workflow "MyDemoWorkFlow" {
  on = "push"
  resolves = ["Debug"]
}

action "Debug" {
  uses = "actions/bin/debug"
}
