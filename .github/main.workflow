workflow "MyDemoWorkFlow" {
  on = "push"
  resolves = ["GitHub Action for npm"]
}

action "Debug" {
  uses = "actions/bin/debug@master"
}

action "GitHub Action for npm" {
  uses = "actions/npm@e7aaefe"
  needs = ["Debug"]
  args = "install"
  secrets = ["GITHUB_TOKEN"]
}
