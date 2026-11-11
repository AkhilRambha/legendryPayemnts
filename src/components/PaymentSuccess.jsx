import { useState } from 'react'
import './PaymentSuccess.css'

function PaymentSuccess({ receipt, onStartOver }) {
  const [showRegistrationDetails, setShowRegistrationDetails] = useState(false)
  const paymentId = receipt.payment_id || receipt.razorpay_payment_id

  return (
    <main className="payment-success">
      <div className="success-mark" aria-hidden="true">✓</div>
      <p className="eyebrow">PAYMENT COMPLETE</p>
      <h1>Thank you for your payment</h1>
      <p className="success-description">
        Your payment was verified successfully.
      </p>
      <div className="receipt-details">
        <div>
          <span>Amount paid</span>
          <strong>₹{Number(receipt.amount).toFixed(2)}</strong>
        </div>
        <div>
          <span>Payment ID</span>
          <strong className="receipt-id">{paymentId}</strong>
        </div>
      </div>
      {receipt.warning ? (
        <p className="receipt-warning" role="alert">{receipt.warning}</p>
      ) : (
        <p className="receipt-saved">Your receipt has been saved.</p>
      )}
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
      <button className="pay-button" type="button" onClick={onStartOver}>
        Done
      </button>
    </main>
  )
}

export default PaymentSuccess
