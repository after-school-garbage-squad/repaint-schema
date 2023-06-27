import { run, watch } from "../expandRef.js";

switch (process.argv[2]) {
  case "run":
  case undefined:
    run();
    break;
  case "watch":
    watch();
    break;
  default:
    console.log("unknown command. possible values are run and watch");
}
