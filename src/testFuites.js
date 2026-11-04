import "./ui/styles/tokens.css";
import "./ui/styles/base.css";
import "./ui/styles/vpnNavigateur.css";
import { appliquerCacheDemarrage } from "./ui/apparence.js";
import { demarrerTestFuites } from "./ui/vpn/testFuites.js";

appliquerCacheDemarrage();
demarrerTestFuites(document.getElementById("test-fuites"));
