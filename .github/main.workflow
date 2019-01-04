workflow "MyDemoWorkFlow" {
  on = "push"
  resolves = ["Debug", "GitHub Action for npm"]
}

action "Debug" {
  uses = "actions/bin/debug@master"
}

action "GitHub Action for npm" {
  uses = "actions/npm@e7aaefe"
  args = "install"
  secrets = ["GITHUB_TOKEN"]
}
