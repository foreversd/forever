workflow "MyDemoWorkFlow" {
  on = "push"
  resolves = ["GitHub Action for npm-1"]
}

action "GitHub Action for npm" {
  uses = "actions/npm@e7aaefe"
  args = "install"
  secrets = ["GITHUB_TOKEN"]
}

action "GitHub Action for npm-1" {
  uses = "actions/npm@e7aaefe"
  needs = ["GitHub Action for npm"]
  args = "ls"
  secrets = ["GITHUB_TOKEN"]
}
