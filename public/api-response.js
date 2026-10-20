// Business conflicts (such as changed group roles) should stay on the page.
// Only authentication failures invalidate the current browser session.
export async function requiresSessionReload(response,url){
 if(response.status===401)return url!=='/api/auth/login';
 if(response.status!==409)return false;
 try{return (await response.clone().json()).code==='SESSION_CHANGED';}catch{return false;}
}
