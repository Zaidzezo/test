import {DeploymentDetail} from '../../../../../components/deployment-detail';
export default async function Page({params}:{params:Promise<{id:string;deploymentId:string}>}){const {id,deploymentId}=await params;return <DeploymentDetail id={deploymentId} projectId={id}/>;}
