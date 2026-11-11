import { useState } from 'react'
import './PaymentSuccess.css'

function PaymentSuccess({ receipt, onContinueRegistration }) {
  const [showRegistrationDetails, setShowRegistrationDetails] = useState(false)
  const paymentId = receipt.payment_id || receipt.razorpay_payment_id
  const amountLabel = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: receipt.currency || 'INR',
  }).format(receipt.amount)

  return (
    <main className="payment-success">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">PAYMENT COMPLETE</p>
      <h1>Payment successful!</h1>
      <p className="success-description">Your booking has been confirmed.</p>
      <div className="booking-status">
        <p><span>Booking ID</span><strong>{receipt.booking_id}</strong></p>
        <p><span>Payment</span><strong className="status-badge verified">Verified</strong></p>
        <p><span>Attendee registration</span><strong className="status-badge pending">Pending</strong></p>
        <p><span>Amount paid</span><strong>{amountLabel}</strong></p>
        <p><span>Payment ID</span><strong className="receipt-id">{paymentId}</strong></p>
      </div>
      <button
        className="details-toggle"
        type="button"
        aria-expanded={showRegistrationDetails}
        aria-controls="registration-details"
        onClick={() => setShowRegistrationDetails((shown) => !shown)}
      >
        {showRegistrationDetails ? 'Hide registration details' : 'View registration details'}
      </button>
      {showRegistrationDetails && (
        <div className="registration-details" id="registration-details">
          <h2>Registration details</h2>
          <p><span>Name</span><strong>{receipt.customer.name}</strong></p>
          <p><span>Email</span><strong>{receipt.customer.email}</strong></p>
          <p><span>Phone</span><strong>{receipt.customer.contact}</strong></p>
        </div>
      )}
      <button className="pay-button" type="button" onClick={onContinueRegistration}>
        Continue to Attendee Registration <span aria-hidden="true">→</span>
      </button>
      <p className="registration-note">
        Add up to {receipt.attendee_limit} attendee names for this booking.
      </p>
    </main>
  )
}

export default PaymentSuccess
