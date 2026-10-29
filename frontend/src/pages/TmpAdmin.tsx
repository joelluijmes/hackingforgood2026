import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type ProjectDoc } from '../api';
import ParticipantAdminPanel from '../components/ParticipantAdminPanel';
export default function TmpAdmin() {
  const id = Number(useParams().id);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  useEffect(() => {
    api.listProjectDocs(id).then(setDocs);
  }, [id]);
  return (
    <main className="page">
      <ParticipantAdminPanel projectId={id} docs={docs} approved />
    </main>
  );
}
