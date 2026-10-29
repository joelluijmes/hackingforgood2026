import { Link } from 'react-router-dom';
import BloomMark from '../components/BloomMark';
import '../landing.css';

const STEPS = [
  [
    'Bring the sponsor documents',
    'Upload what the sponsor sent, in any format.',
  ],
  [
    'Get consent forms in minutes',
    'Four ICF types, in the Belgian template, with every gap flagged.',
  ],
  [
    'Review, translate, share',
    'PI review, Dutch and French, a download for ethics, and a portal where families can ask questions.',
  ],
];

export default function Home() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <BloomMark size={84} />
        <p className="wordmark">BLOOM</p>
        <p className="expansion">Studio · BSPHO's Light Online cOnsent Maker</p>
        <h1>
          Consent forms that children, parents and ethics committees can trust.
        </h1>
        <p className="lead">
          BLOOM Studio turns sponsor documents into Belgian-compliant informed
          consent forms, so research teams spend their time on children, not on
          paperwork.
        </p>
        <div className="row center">
          <Link to="/projects" className="btn primary big">
            Start a project
          </Link>
          <Link to="/about" className="btn ghost big">
            What's inside
          </Link>
        </div>
      </section>

      <ol className="landing-steps">
        {STEPS.map(([title, text], i) => (
          <li key={title}>
            <span>{i + 1}</span>
            <b>{title}</b>
            <p>{text}</p>
          </li>
        ))}
      </ol>

      <p className="landing-foot">
        4 ICF types · English, Dutch and French · Word in, Word out · answers
        for participants
      </p>
    </div>
  );
}
