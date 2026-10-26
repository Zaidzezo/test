import './globals.css';
import type { Metadata } from 'next';
import { Shell } from '../components/shell';
export const metadata: Metadata = {title:'DeployGrid · Mission control',description:'From repository to running application.'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body><Shell>{children}</Shell></body></html>;}
