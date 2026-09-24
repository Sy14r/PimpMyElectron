// Invoked only by the signed native launcher. No renderer or arbitrary script input.
import {fileURLToPath} from 'node:url';import path from 'node:path';import {ClientManager} from './core/manager.mjs';
try{
 const [id,shortcutPath]=process.argv.slice(2);const root=fileURLToPath(new URL('..',import.meta.url));
 const manager=await new ClientManager({root,helper:path.join(root,'bin/SlackTriage')}).init();
 await manager.launchShortcut(id,shortcutPath);
}catch(error){console.error(error.message);process.exitCode=1;}
