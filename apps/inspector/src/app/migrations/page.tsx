import { redirect } from 'next/navigation';
export default function Migrations() {
  redirect('/migrations/12-refund-workflow');
}
