Set-Location C:\a\avalo\functions

$src="src\testUtils.ts"

@"
import * as admin from 'firebase-admin'
import { Timestamp } from 'firebase-admin/firestore'

function ensureAdmin(){
 if(admin.apps.length===0){
   admin.initializeApp()
 }
}

export function getDb(){
 ensureAdmin()
 return admin.firestore()
}

export async function setupTestEnvironment(){
 ensureAdmin()
}

export const testData={
 generateUserId(){
   return "test_user_"+Date.now()+"_"+Math.random().toString(36).substring(2,10)
 }
}

export async function createTestUser(id:string,data:any={}){
 const db=getDb()
 await db.collection("users").doc(id).set({
   tokens:0,
   createdAt:Timestamp.now(),
   ...data
 })
}

export async function createTestTransaction(userId:string,amount:number,type:string){
 const db=getDb()
 await db.collection("transactions").add({
   userId,
   amount,
   type,
   createdAt:Timestamp.now()
 })
}

export function now(){
 return Timestamp.now()
}

export function minutesAgo(m:number){
 return Timestamp.fromMillis(Date.now()-m*60000)
}

export function hoursAgo(h:number){
 return Timestamp.fromMillis(Date.now()-h*3600000)
}

export function daysAgo(d:number){
 return Timestamp.fromMillis(Date.now()-d*86400000)
}
"@ | Set-Content $src -Encoding UTF8

# fix mocha before/after
Get-ChildItem tests -Recurse -Filter *.ts | ForEach-Object {
 $c=Get-Content $_.FullName -Raw
 $n=$c.Replace("before(","beforeAll(").Replace("after(","afterAll(")
 if($n -ne $c){Set-Content $_.FullName $n}
}

npm run build
npm test
