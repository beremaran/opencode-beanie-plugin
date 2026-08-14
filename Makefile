OPENCODE_BIN ?= opencode
COMMIT_MODEL ?= opencode/deepseek-v4-flash-free
COMMIT_FLAGS ?= --pure
COMMIT_TITLE ?= committing changes
COMMIT_PROMPT ?= Commit changes.

.PHONY: commit

commit:
	$(OPENCODE_BIN) run $(COMMIT_FLAGS) --model "$(COMMIT_MODEL)" --title "$(COMMIT_TITLE)" "$(COMMIT_PROMPT)"
