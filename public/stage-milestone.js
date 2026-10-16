export function shouldShowHalfwayEncouragement(previousStage,nextStage,alreadyShown){
 return previousStage===3&&nextStage===4&&!alreadyShown;
}
