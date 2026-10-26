"use client";
import { AlertCircle, LoaderCircle } from 'lucide-react';
export function Badge({status}:{status:string}) {return <span className={`badge ${['RUNNING','SUCCEEDED'].includes(status)?'good':status==='FAILED'?'bad':['NOT_DEPLOYED','STOPPED','UNKNOWN'].includes(status)?'neutral':'working'}`}><span className="dot"/>{status.toLowerCase().replaceAll('_',' ')}</span>;}
export function ErrorBox({error}:{error:unknown}) {return error ? <div role="alert" className="error"><AlertCircle size={17}/>{error instanceof Error ? error.message:String(error)}</div>:null;}
export function Loading(){return <div className="loading"><LoaderCircle className="spin"/>Loading workspace…</div>;}
export const date = (v:string) => new Date(v).toLocaleString();
