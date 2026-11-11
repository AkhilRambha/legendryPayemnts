import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import './AttendeeRegistration.css'

function AttendeeRegistration({ booking, onStartOver }) {
  const [attendees, setAttendees] = useState([
    { id: 1, name: booking.customer.name },
  ])
  const [nextAttendeeId, setNextAttendeeId] = useState(2)
  const [tickets, setTickets] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const attendeeLimit = Number(booking.attendee_limit)

  function updateName(id, name) {
    setAttendees((current) =>
      current.map((attendee) => attendee.id === id ? { ...attendee, name } : attendee),
    )
  }

  function addAttendee() {
    setAttendees((current) => [...current, { id: nextAttendeeId, name: '' }])
    setNextAttendeeId((id) => id + 1)
  }

  function removeAttendee(id) {
    setAttendees((current) => current.filter((attendee) => attendee.id !== id))
  }

  async function submitRegistration(event) {
    event.preventDefault()
    setIsSaving(true)
    setError('')

    try {
      const response = await fetch('/api/register-attendees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: booking.booking_id,
          registration_token: booking.registration_token,
          attendees: attendees.map(({ name }) => ({ name })),
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Could not complete attendee registration.')
      }
      setTickets(result.tickets)
    } catch (registrationError) {
      setError(registrationError.message || 'Could not complete attendee registration.')
    } finally {
      setIsSaving(false)
    }
  }

  function downloadTickets() {
    setDownloadError('')
    const qrCodes = Array.from(
      document.querySelectorAll('.issued-ticket svg'),
    )
    if (!tickets || qrCodes.length !== tickets.length) {
      setDownloadError('Could not prepare your tickets. Please try again.')
      return
    }

    try {
      const ticketMarkup = tickets.map((ticket, index) => {
        const svg = qrCodes[index].cloneNode(true)
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
        const qrCode = new XMLSerializer().serializeToString(svg)
        return `
          <article class="ticket">
            ${qrCode}
            <p class="attendee-number">Attendee ${escapeHtml(ticket.attendeeNumber)}</p>
            <h1>${escapeHtml(ticket.attendeeName)}</h1>
            <p>${escapeHtml(booking.event_name)}</p>
            <p>Booking ID: ${escapeHtml(booking.booking_id)}</p>
          </article>
        `
      }).join('')
      const html = `<!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Tickets - ${escapeHtml(booking.booking_id)}</title>
            <style>
              body { margin: 0; padding: 24px; color: #201b32; font-family: Arial, sans-serif; }
              .ticket { box-sizing: border-box; display: grid; justify-items: center; gap: 10px; max-width: 420px; margin: 0 auto 24px; padding: 28px; border: 1px solid #dedce6; border-radius: 16px; text-align: center; break-after: page; }
              .ticket:last-child { break-after: auto; }
              .ticket svg { width: 200px; height: 200px; }
              .ticket h1, .ticket p { margin: 0; overflow-wrap: anywhere; }
              .ticket h1 { font-size: 22px; }
              .ticket p { color: #5f5b69; }
              .ticket .attendee-number { color: #765df3; font-size: 12px; font-weight: 700; text-transform: uppercase; }
              @media print { body { padding: 0; } .ticket { max-width: none; min-height: 90vh; margin: 0; border: 0; border-radius: 0; } }
            </style>
          </head>
          <body>${ticketMarkup}</body>
        </html>`
      const file = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(file)
      const link = document.createElement('a')
      const filename = booking.booking_id.replace(/[^a-z\d_-]/gi, '-')
      link.href = url
      link.download = `${filename}-tickets.html`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDownloadError('Unable to download tickets. Please try again.')
    }
  }

  if (tickets) {
    return (
      <main className="attendee-card">
        <p className="eyebrow">REGISTRATION COMPLETE</p>
        <h1>Your tickets are ready</h1>
        <p className="attendee-description">
          Show each attendee’s QR code at check-in.
        </p>
        <div className="issued-tickets">
          {tickets.map((ticket) => (
            <article className="issued-ticket" key={ticket.ticketId}>
              <QRCodeSVG
                value={ticket.qrToken}
                size={156}
                level="M"
                title={`Entry ticket for ${ticket.attendeeName}`}
              />
              <div>
                <span>Attendee {ticket.attendeeNumber}</span>
                <strong>{ticket.attendeeName}</strong>
                <small>Booking {booking.booking_id}</small>
              </div>
            </article>
          ))}
        </div>
        {downloadError && <p className="attendee-error" role="alert">{downloadError}</p>}
        <button className="pay-button" type="button" onClick={downloadTickets}>
          Download Tickets
        </button>
        <button className="pay-button" type="button" onClick={onStartOver}>
          Done
        </button>
      </main>
    )
  }

  return (
    <main className="attendee-card">
      <p className="eyebrow">{booking.event_name}</p>
      <h1>Complete Your Registration</h1>
      <p className="attendee-description">
        Booking ID: <strong>{booking.booking_id}</strong>
      </p>
      <div className="attendee-section-heading">
        <h2>Attendee Details</h2>
        <span>{attendees.length} / {attendeeLimit} added</span>
      </div>
      <form className="attendee-form" onSubmit={submitRegistration}>
        {attendees.map((attendee, index) => (
          <label className="attendee-field" key={attendee.id}>
            <span className="attendee-field-title">
              <span>{index === 0 ? 'Main Attendee' : `Additional Member ${index}`}</span>
              {index > 0 && (
                <button
                  type="button"
                  className="remove-attendee"
                  aria-label={`Remove additional member ${index}`}
                  onClick={() => removeAttendee(attendee.id)}
                >
                  ×
                </button>
              )}
            </span>
            <input
              autoComplete="name"
              maxLength={100}
              required
              value={attendee.name}
              onChange={(event) => updateName(attendee.id, event.target.value)}
              placeholder="Enter full name"
            />
          </label>
        ))}
        {attendees.length < attendeeLimit && (
          <button className="add-attendee" type="button" onClick={addAttendee}>
            + Add Member
          </button>
        )}
        {error && <p className="attendee-error" role="alert">{error}</p>}
        <button className="pay-button" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving registration…' : 'Complete Registration'}
        </button>
      </form>
    </main>
  )
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

export default AttendeeRegistration
