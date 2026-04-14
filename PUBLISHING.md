Agents: DO NOT attempt to publish this project. The publishing function is a manual process performed only by humans.

Publishing Checklist
--------------------

1. Run linting and tests with `npm test`.
2. Run the deno check with `deno lint`.
3. Check the documentation with `deno doc mod.js`.
4. Ensure the version number in package.json and deno.json is correct. Double check the other metadata while you're at it.
5. Make sure all changes are committed to the main branch and push to the remote origin.
6. Run `npm login` and `npm publish`.
7. Run `deno publish`.
8. Tag the release with `git -a <tag> -m <message>` and push the tag to the remote origin.
9. Find the tag on GitHub and promote it to a release using "Create release from tag".
