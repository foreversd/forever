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

workflow "DummyFlow" {
  on = "push"
  resolves = ["actions/bin/sh"]
}

action "actions/bin/sh@5968b3a61ecdca99746eddfdc3b3aab7dc39ea31" {
  uses = "actions/bin/sh@5968b3a61ecdca99746eddfdc3b3aab7dc39ea31"
  args = "ls"
  secrets = ["GITHUB_TOKEN"]
}

action "actions/bin/sh" {
  uses = "actions/bin/sh"
  needs = ["actions/bin/sh@5968b3a61ecdca99746eddfdc3b3aab7dc39ea31"]
  args = "ls $HOME"
}
